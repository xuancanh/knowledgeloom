/**
 * SpacesService — create/rename/delete spaces and clean up their data.
 *
 * A space is an isolated sub-workspace: its notes, categories, flashcards,
 * quiz material, reminders, jobs, shares, and learn progress all live under
 * the space's scope key (see scope.util.ts) and never mix with other spaces.
 *
 * The number of spaces a user may create is a plan concern: the limit comes
 * from the UsageService seam (env MAX_SPACES for self-hosted builds,
 * subscription plan in hosted builds).
 */
import { Injectable, Inject, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { SpacesRepository, SpaceRow } from './spaces.repository';
import { DEFAULT_SPACE_ID, DEFAULT_SPACE_NAME, scopeFor } from './scope.util';
import { USAGE_SERVICE, UsageService } from '../usage/usage.interface';
import { SearchService } from '../search/search.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { NoteFileRepository } from '../notes/note-file.repository';
import { RemindersService } from '../reminders/reminders.service';
import { composeMarkdown, noteRelativePath, parseNote, stripFrontmatter } from '../common/note-parser.util';
import type { TransferNoteDto } from './spaces.dto';
import {
  DRIZZLE_DB,
  JOBS_TABLE,
  REMINDERS_TABLE,
  FLASHCARD_CACHE_TABLE,
  FLASHCARD_REVIEWS_TABLE,
  USER_FLASHCARDS_TABLE,
  HIDDEN_FLASHCARDS_TABLE,
  QUIZ_CACHE_TABLE,
  QUIZ_REVIEWS_TABLE,
  QUIZ_HIDDEN_TABLE,
  NOTE_READS_TABLE,
  LEARN_PROGRESS_TABLE,
  REVIEW_EVENTS_TABLE,
  SHARES_TABLE,
  SHARE_ACCESSES_TABLE,
  MARKETPLACE_LISTINGS_TABLE,
} from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';

export interface SpaceSummary {
  id: string;
  name: string;
  builtin: boolean;
  createdAt?: string;
}

const NAME_MAX = 60;

@Injectable()
export class SpacesService {
  private readonly usersDir: string;
  private readonly readOnly: boolean;
  private readonly dialect: string;

  constructor(
    private readonly repo: SpacesRepository,
    private readonly search: SearchService,
    private readonly knowledge: KnowledgeService,
    private readonly notes: NoteFileRepository,
    private readonly reminders: RemindersService,
    @Inject(USAGE_SERVICE) private readonly usage: UsageService,
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(JOBS_TABLE) private readonly jobsTable: any,
    @Inject(REMINDERS_TABLE) private readonly remindersTable: any,
    @Inject(FLASHCARD_CACHE_TABLE) private readonly flashcardCacheTable: any,
    @Inject(FLASHCARD_REVIEWS_TABLE) private readonly flashcardReviewsTable: any,
    @Inject(USER_FLASHCARDS_TABLE) private readonly userFlashcardsTable: any,
    @Inject(HIDDEN_FLASHCARDS_TABLE) private readonly hiddenFlashcardsTable: any,
    @Inject(QUIZ_CACHE_TABLE) private readonly quizCacheTable: any,
    @Inject(QUIZ_REVIEWS_TABLE) private readonly quizReviewsTable: any,
    @Inject(QUIZ_HIDDEN_TABLE) private readonly quizHiddenTable: any,
    @Inject(NOTE_READS_TABLE) private readonly noteReadsTable: any,
    @Inject(LEARN_PROGRESS_TABLE) private readonly learnProgressTable: any,
    @Inject(REVIEW_EVENTS_TABLE) private readonly reviewEventsTable: any,
    @Inject(SHARES_TABLE) private readonly sharesTable: any,
    @Inject(SHARE_ACCESSES_TABLE) private readonly shareAccessesTable: any,
    @Inject(MARKETPLACE_LISTINGS_TABLE) private readonly marketplaceListingsTable: any,
    config: ConfigService,
  ) {
    this.usersDir = config.get<string>('usersDir');
    this.readOnly = config.get<boolean>('readOnly');
    this.dialect = config.get<string>('databaseDialect') || 'sqlite';
  }

  /** All spaces for the user, default space first. */
  async list(userId: string): Promise<{ spaces: SpaceSummary[]; limit: number | null }> {
    const rows = await this.repo.listForUser(userId);
    const spaces: SpaceSummary[] = [
      { id: DEFAULT_SPACE_ID, name: DEFAULT_SPACE_NAME, builtin: true },
      ...rows.map((r) => ({ id: r.id, name: r.name, builtin: false, createdAt: r.createdAt })),
    ];
    const limit = await this.usage.spaceLimit(userId);
    return { spaces, limit };
  }

  async create(userId: string, rawName: unknown): Promise<SpaceSummary> {
    this.assertWritable();
    const name = this.validName(rawName);

    const existing = await this.repo.listForUser(userId);
    const limit = await this.usage.spaceLimit(userId);
    // `existing` excludes the implicit default space, which counts toward the
    // limit — so the total after creating would be existing.length + 2. A limit
    // of 1 therefore means "default space only".
    if (limit !== null && existing.length + 2 > limit) {
      throw new ForbiddenException(
        `space limit reached (${limit} on your plan) — upgrade or delete a space first`,
      );
    }

    const row: SpaceRow = {
      id: `s${randomBytes(5).toString('hex')}`,
      userId,
      name,
      createdAt: new Date().toISOString(),
    };
    await this.repo.insert(row);
    return { id: row.id, name: row.name, builtin: false, createdAt: row.createdAt };
  }

  async rename(userId: string, spaceId: string, rawName: unknown): Promise<SpaceSummary> {
    this.assertWritable();
    if (spaceId === DEFAULT_SPACE_ID) {
      throw new BadRequestException('the default space cannot be renamed');
    }
    const name = this.validName(rawName);
    const row = await this.repo.findForUser(userId, spaceId);
    if (!row) throw new NotFoundException('space not found');
    await this.repo.rename(userId, spaceId, name);
    return { id: spaceId, name, builtin: false, createdAt: row.createdAt };
  }

  async transferNote(
    userId: string,
    input: TransferNoteDto,
  ): Promise<{ noteId: string; fromSpaceId: string; toSpaceId: string; mode: 'copy' | 'move' }> {
    this.assertWritable();
    if (input.fromSpaceId === input.toSpaceId) {
      throw new BadRequestException('source and destination spaces must be different');
    }
    await Promise.all([
      this.assertSpaceOwned(userId, input.fromSpaceId),
      this.assertSpaceOwned(userId, input.toSpaceId),
    ]);

    const rawNoteId = String(input.noteId || '').trim();
    const noteId = basename(rawNoteId);
    if (!noteId || noteId !== rawNoteId) throw new BadRequestException('invalid note id');

    const fromScope = scopeFor(userId, input.fromSpaceId);
    const toScope = scopeFor(userId, input.toSpaceId);
    const sourceFile = await this.notes.findById(fromScope, noteId);
    if (!sourceFile) throw new NotFoundException('note not found in source space');
    if (await this.notes.findById(toScope, noteId)) {
      throw new ConflictException('a note with this id already exists in the destination space');
    }

    const sourceMarkdown = await this.notes.readMarkdown(fromScope, noteId);
    const source = parseNote(sourceFile, sourceMarkdown);
    const transferredMarkdown = composeMarkdown({
      ...source,
      links: [],
      bilinks: [],
      body: stripFrontmatter(sourceMarkdown),
    });
    await this.notes.write(
      toScope,
      noteRelativePath(noteId, source.category),
      transferredMarkdown,
    );

    if (input.mode === 'move') {
      await this.notes.delete(fromScope, sourceFile);
      await this.reminders.removeForNote(fromScope, noteId);
      await this.search.deleteDocument(fromScope, noteId).catch(() => { /* rebuild retries cleanup */ });
    }

    await this.knowledge.rebuildIndexes(toScope);
    if (input.mode === 'move') await this.knowledge.rebuildIndexes(fromScope);

    return {
      noteId,
      fromSpaceId: input.fromSpaceId,
      toSpaceId: input.toSpaceId,
      mode: input.mode,
    };
  }

  /**
   * Deletes a space and everything inside it: note files, per-scope DB rows,
   * and the search index. Irreversible; the default space cannot be deleted.
   */
  async delete(userId: string, spaceId: string): Promise<{ deleted: string }> {
    this.assertWritable();
    if (spaceId === DEFAULT_SPACE_ID) {
      throw new BadRequestException('the default space cannot be deleted');
    }
    const row = await this.repo.findForUser(userId, spaceId);
    if (!row) throw new NotFoundException('space not found');

    const scope = scopeFor(userId, spaceId);

    // Stop the stale-while-revalidate path before touching the scope's files.
    await this.knowledge.prepareForScopeDeletion(scope);

    // 1. Search index — sync an empty note set (removes every document).
    await this.search.sync(scope, []).catch(() => { /* best-effort */ });

    // 2. Note files + per-scope JSON artefacts.
    await rm(join(this.usersDir, scope), {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });

    // 3. Per-scope DB rows across every scoped table — atomically, so a
    //    mid-loop failure can't leave a half-deleted space behind.
    if (this.db) {
      const scopedTables = [
        this.jobsTable,
        this.remindersTable,
        this.flashcardCacheTable,
        this.flashcardReviewsTable,
        this.userFlashcardsTable,
        this.hiddenFlashcardsTable,
        this.quizCacheTable,
        this.quizReviewsTable,
        this.quizHiddenTable,
        this.noteReadsTable,
        this.learnProgressTable,
        this.reviewEventsTable,
        this.shareAccessesTable,
        this.sharesTable,
        this.marketplaceListingsTable,
      ];
      if (this.dialect === 'postgres') {
        await this.db.transaction(async (tx: any) => {
          for (const table of scopedTables) {
            await tx.delete(table).where(eq(table.userId, scope));
          }
        });
      } else {
        this.db.transaction((tx: any) => {
          for (const table of scopedTables) {
            tx.delete(table).where(eq(table.userId, scope)).run();
          }
        });
      }
    }

    // 4. The space row itself (also invalidates the guard's ownership cache).
    await this.repo.delete(userId, spaceId);
    return { deleted: spaceId };
  }

  private validName(rawName: unknown): string {
    const name = String(rawName ?? '').trim();
    if (!name || name.length > NAME_MAX) {
      throw new BadRequestException(`space name must be 1-${NAME_MAX} characters`);
    }
    return name;
  }

  private async assertSpaceOwned(userId: string, spaceId: string): Promise<void> {
    if (spaceId === DEFAULT_SPACE_ID) return;
    if (!(await this.repo.findForUser(userId, spaceId))) {
      throw new NotFoundException('space not found');
    }
  }

  private assertWritable(): void {
    if (this.readOnly) throw new ForbiddenException('service is running in read-only mode');
  }
}
