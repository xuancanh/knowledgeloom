/**
 * Marketplace — publish shares as browseable listings; import them into your
 * own vault, deck included.
 *
 * Authenticated routes:
 *   POST   /api/marketplace/publish     { shareId, title, description?, tags?, author? }
 *   POST   /api/marketplace/:id/import  → clones notes + seeds decks into the caller's vault
 *   DELETE /api/marketplace/:id         → unpublish (owner only)
 *   GET    /api/marketplace/mine        → caller's active listings
 *
 * Public routes (browsing needs no account):
 *   GET /api/marketplace?q=&kind=       → active listings
 *   GET /api/marketplace/:id           → listing + full share payload (preview)
 *
 * Importing seeds the flashcard/quiz caches with the listing's cards keyed to
 * the new notes' content hashes, so an import never triggers AI regeneration
 * or consumes AI quota.
 */
import {
  Controller, Get, Post, Delete, Body, Param, Query, HttpCode, UseGuards,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, basename } from 'node:path';
import { MarketplaceRepository, ListingRow } from './marketplace.repository';
import { MarketplaceRatingsRepository, RatingAggregate } from './marketplace-ratings.repository';
import { MarketplaceReportsRepository } from './marketplace-reports.repository';
import { SharesRepository } from '../shares/shares.repository';
import { SharePayloadService, SharedNotePayload } from '../shares/share-payload.service';
import { NoteFileRepository } from '../notes/note-file.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { QuizService } from '../quiz/quiz.service';
import { composeMarkdown, parseNote, uniqueNoteSlug, noteRelativePath } from '../common/note-parser.util';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { CurrentScope } from '../auth/current-scope.decorator';
import { ownerOf } from '../spaces/scope.util';
import { WritableGuard } from '../common/guards/writable.guard';
import { PublishListingDto, RateListingDto, ReportListingDto } from './marketplace.dto';

const MAX_TAGS = 10;
// Distinct users who must report a listing before it is auto-unpublished.
const REPORT_THRESHOLD = 5;

function publicListing(l: ListingRow, rating?: RatingAggregate) {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    kind: l.kind,
    tags: l.tags,
    author: l.author,
    imports: l.imports,
    publishedAt: l.publishedAt,
    avgStars: rating?.avgStars ?? null,
    ratingCount: rating?.ratingCount ?? 0,
  };
}

@Controller('api/marketplace')
@UseGuards(ApiAuthGuard)
export class MarketplaceController {
  constructor(
    private readonly listings: MarketplaceRepository,
    private readonly ratings: MarketplaceRatingsRepository,
    private readonly reports: MarketplaceReportsRepository,
    private readonly shares: SharesRepository,
    private readonly payloads: SharePayloadService,
    private readonly noteRepo: NoteFileRepository,
    private readonly knowledgeService: KnowledgeService,
    private readonly flashcardsService: FlashcardsService,
    private readonly quizService: QuizService,
    private readonly config: ConfigService,
  ) {}

  @Post('publish')
  @UseGuards(WritableGuard)
  async publish(
    @CurrentScope() userId: string,
    @Body() body: PublishListingDto,
  ) {
    const shareId = String(body?.shareId || '').trim();
    const title = String(body?.title || '').trim();
    if (!shareId || !title) throw new BadRequestException('shareId and title are required');

    const share = await this.shares.findActive(shareId);
    if (!share || share.userId !== userId) throw new NotFoundException('share not found');
    const existing = await this.listings.activeByShare(shareId);
    if (existing) throw new BadRequestException('this share is already published');

    // Verify the share still resolves before putting it in the gallery.
    await this.payloads.build(share);

    const listing = await this.listings.create({
      shareId,
      userId,
      title: title.slice(0, 120),
      description: String(body?.description || '').trim().slice(0, 1000),
      kind: share.kind,
      tags: (Array.isArray(body?.tags) ? body.tags : []).map((t) => String(t).trim()).filter(Boolean).slice(0, MAX_TAGS),
      author: String(body?.author || '').trim().slice(0, 60),
    });
    return { listing: publicListing(listing) };
  }

  @Get('mine')
  async mine(@CurrentUser() userId: string) {
    // Listings published from any of the user's spaces — a userId-scoped query
    // (not a scan of the whole gallery).
    const own = await this.listings.listByOwner(userId);
    return { listings: own.map((l) => publicListing(l)) };
  }

  @Delete(':id')
  @UseGuards(WritableGuard)
  @HttpCode(200)
  async unpublish(@CurrentUser() userId: string, @Param('id') id: string) {
    // Owner check is per user, not per space — you can unpublish a listing
    // created in another of your spaces.
    const listing = await this.listings.findActive(basename(id));
    if (!listing || ownerOf(listing.userId) !== userId) throw new NotFoundException('listing not found');
    const ok = await this.listings.unpublish(listing.userId, listing.id);
    if (!ok) throw new NotFoundException('listing not found');
    return { unpublished: id };
  }

  @Post(':id/rate')
  @UseGuards(WritableGuard)
  @HttpCode(200)
  async rate(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: RateListingDto,
  ) {
    const stars = Math.round(Number(body?.stars));
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new BadRequestException('stars must be 1–5');
    const listing = await this.listings.findActive(basename(id));
    if (!listing) throw new NotFoundException('listing not found');
    // Rating identity is the user, so publishing from another space doesn't
    // allow self-rating.
    if (ownerOf(listing.userId) === userId) throw new BadRequestException('you cannot rate your own listing');

    await this.ratings.rate(listing.id, userId, stars, String(body?.comment || '').trim().slice(0, 500));
    const agg = (await this.ratings.aggregates([listing.id])).get(listing.id);
    return { rated: listing.id, stars, avgStars: agg?.avgStars ?? stars, ratingCount: agg?.ratingCount ?? 1 };
  }

  @Post(':id/report')
  @UseGuards(WritableGuard)
  @HttpCode(200)
  async report(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: ReportListingDto,
  ) {
    const listing = await this.listings.findActive(basename(id));
    if (!listing) throw new NotFoundException('listing not found');
    // Report identity is the user, so a report from another of your spaces
    // doesn't let you flag your own listing.
    if (ownerOf(listing.userId) === userId) throw new BadRequestException('you cannot report your own listing');

    const count = await this.reports.report(listing.id, userId, String(body?.reason || '').trim().slice(0, 500));
    // Community moderation: enough distinct reports takes it out of the gallery
    // pending review. Owner can still see/manage it via "mine".
    if (count >= REPORT_THRESHOLD) {
      await this.listings.unpublish(listing.userId, listing.id);
      return { reported: listing.id, reportCount: count, unpublished: true };
    }
    return { reported: listing.id, reportCount: count, unpublished: false };
  }

  @Post(':id/import')
  @HttpCode(200)
  @UseGuards(WritableGuard)
  async importListing(@CurrentScope() userId: string, @Param('id') id: string) {
    const listing = await this.listings.findActive(basename(id));
    if (!listing) throw new NotFoundException('listing not found');
    const share = await this.shares.findActive(listing.shareId);
    if (!share) throw new NotFoundException('listing content is no longer available');

    const payload = await this.payloads.build(share);
    const sourceNotes: SharedNotePayload[] = payload.kind === 'category' ? (payload.notes || []) : payload.note ? [payload.note] : [];
    if (!sourceNotes.length) throw new NotFoundException('listing has no content');

    const usersDir = this.config.get<string>('usersDir');
    const userNotesDir = join(usersDir, userId, 'notes');

    const importedNoteIds: string[] = [];
    let seededCards = 0;
    let seededQuestions = 0;

    for (const src of sourceNotes) {
      const slug = uniqueNoteSlug(src.title, userNotesDir);
      const markdown = composeMarkdown({
        title: src.title,
        category: src.category,
        summary: src.summary,
        tags: src.tags,
        links: [], // vault-local link ids never cross accounts
        createdAt: new Date().toISOString(),
        body: src.body,
      });
      await this.noteRepo.write(userId, noteRelativePath(slug, src.category), markdown);

      const note = parseNote(`${slug}.md`, markdown);
      const cards = payload.flashcards.filter((c: any) => !c.noteTitle || c.noteTitle === src.title);
      const questions = payload.quiz.filter((q: any) => !q.noteTitle || q.noteTitle === src.title);
      if (cards.length) seededCards += await this.flashcardsService.seedCache(userId, note, markdown, cards);
      if (questions.length) seededQuestions += await this.quizService.seedCache(userId, note, markdown, questions);
      importedNoteIds.push(slug);
    }

    const state = await this.knowledgeService.rebuildIndexes(userId);
    await this.listings.incrementImports(listing.id);

    return {
      imported: {
        notes: importedNoteIds,
        flashcards: seededCards,
        quiz: seededQuestions,
      },
      state,
    };
  }
}

/** Public browsing — no account needed to look at the gallery. */
@Controller('api/marketplace')
export class PublicMarketplaceController {
  constructor(
    private readonly listings: MarketplaceRepository,
    private readonly ratings: MarketplaceRatingsRepository,
    private readonly shares: SharesRepository,
    private readonly payloads: SharePayloadService,
  ) {}

  @Get()
  async browse(
    @Query('q') q = '',
    @Query('kind') kind = '',
    @Query('sort') sort = '',
    @Query('limit') limitRaw = '',
    @Query('offset') offsetRaw = '',
  ) {
    const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 50);
    const offset = Math.max(Number(offsetRaw) || 0, 0);

    let items = await this.listings.listActive();
    if (kind === 'note' || kind === 'category') items = items.filter((l) => l.kind === kind);
    const needle = q.trim().toLowerCase();
    if (needle) {
      items = items.filter((l) =>
        `${l.title} ${l.description} ${l.tags.join(' ')} ${l.author}`.toLowerCase().includes(needle));
    }

    // Sort the id list before hydrating ratings, then paginate — so ratings are
    // aggregated only for the page being returned, not the whole result set.
    if (sort === 'imports') {
      items = items.sort((a, b) => b.imports - a.imports);
    } else if (sort !== 'rating') {
      // default: already newest-first from listActive(); keep as-is.
    }

    const total = items.length;

    if (sort === 'rating') {
      // Rating sort needs every candidate's aggregate to order correctly, so it
      // hydrates the filtered set before paging. Bayesian-ish tiebreak: unrated
      // listings sink below rated ones.
      const aggsAll = await this.ratings.aggregates(items.map((l) => l.id));
      const ordered = items
        .map((l) => publicListing(l, aggsAll.get(l.id)))
        .sort((a, b) => (b.avgStars ?? 0) * Math.log1p(b.ratingCount)
          - (a.avgStars ?? 0) * Math.log1p(a.ratingCount));
      return { listings: ordered.slice(offset, offset + limit), total, limit, offset };
    }

    const page = items.slice(offset, offset + limit);
    const aggs = await this.ratings.aggregates(page.map((l) => l.id));
    return {
      listings: page.map((l) => publicListing(l, aggs.get(l.id))),
      total,
      limit,
      offset,
    };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const listing = await this.listings.findActive(basename(id));
    if (!listing) throw new NotFoundException('listing not found');
    const share = await this.shares.findActive(listing.shareId);
    if (!share) throw new NotFoundException('listing content is no longer available');
    const payload = await this.payloads.build(share);
    const agg = (await this.ratings.aggregates([listing.id])).get(listing.id);
    const comments = await this.ratings.comments(listing.id);
    return { listing: publicListing(listing, agg), shareUrl: `/share/${share.id}`, payload, comments };
  }
}
