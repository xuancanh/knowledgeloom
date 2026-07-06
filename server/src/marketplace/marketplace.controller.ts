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
import { SharesRepository } from '../shares/shares.repository';
import { SharePayloadService, SharedNotePayload } from '../shares/share-payload.service';
import { NoteFileRepository } from '../notes/note-file.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { QuizService } from '../quiz/quiz.service';
import { composeMarkdown, parseNote, uniqueNoteSlug, noteRelativePath } from '../common/note-parser.util';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WritableGuard } from '../common/guards/writable.guard';

const MAX_TAGS = 10;

function publicListing(l: ListingRow) {
  return {
    id: l.id,
    title: l.title,
    description: l.description,
    kind: l.kind,
    tags: l.tags,
    author: l.author,
    imports: l.imports,
    publishedAt: l.publishedAt,
  };
}

@Controller('api/marketplace')
@UseGuards(ApiAuthGuard)
export class MarketplaceController {
  constructor(
    private readonly listings: MarketplaceRepository,
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
    @CurrentUser() userId: string,
    @Body() body: { shareId?: string; title?: string; description?: string; tags?: string[]; author?: string },
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
    const all = await this.listings.listActive();
    return { listings: all.filter((l) => l.userId === userId).map(publicListing) };
  }

  @Delete(':id')
  @HttpCode(200)
  async unpublish(@CurrentUser() userId: string, @Param('id') id: string) {
    const ok = await this.listings.unpublish(userId, basename(id));
    if (!ok) throw new NotFoundException('listing not found');
    return { unpublished: id };
  }

  @Post(':id/import')
  @HttpCode(200)
  @UseGuards(WritableGuard)
  async importListing(@CurrentUser() userId: string, @Param('id') id: string) {
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
    private readonly shares: SharesRepository,
    private readonly payloads: SharePayloadService,
  ) {}

  @Get()
  async browse(@Query('q') q = '', @Query('kind') kind = '') {
    let items = await this.listings.listActive();
    if (kind === 'note' || kind === 'category') items = items.filter((l) => l.kind === kind);
    const needle = q.trim().toLowerCase();
    if (needle) {
      items = items.filter((l) =>
        `${l.title} ${l.description} ${l.tags.join(' ')} ${l.author}`.toLowerCase().includes(needle));
    }
    return { listings: items.slice(0, 50).map(publicListing) };
  }

  @Get(':id')
  async detail(@Param('id') id: string) {
    const listing = await this.listings.findActive(basename(id));
    if (!listing) throw new NotFoundException('listing not found');
    const share = await this.shares.findActive(listing.shareId);
    if (!share) throw new NotFoundException('listing content is no longer available');
    const payload = await this.payloads.build(share);
    return { listing: publicListing(listing), shareUrl: `/share/${share.id}`, payload };
  }
}
