/**
 * KnowledgeService — the "rebuild pipeline" that keeps every derived artifact
 * in sync with the markdown source of truth.
 *
 * Responsibilities:
 *  1. Read all note files via NoteFileRepository (scoped to userId).
 *  2. Migrate note files to the correct category folder when the category
 *     front-matter changes (e.g. after an AI edit).
 *  3. Build the category hierarchy from the collected note metadata.
 *  4. Delegate AI flashcard generation to FlashcardsService.
 *  5. Push incremental updates to Meilisearch via SearchService.
 *  6. Persist the canonical index.json snapshot consumed by the frontend.
 *
 * This service is intentionally free of HTTP concerns; every mutating route
 * calls it at the end to settle the knowledge graph into a consistent state.
 * All methods require a userId and operate exclusively on that user's data.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { NoteFileRepository } from '../notes/note-file.repository';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { QuizService } from '../quiz/quiz.service';
import { SearchService } from '../search/search.service';
import { slugify, parseNote, noteRelativePath } from '../common/note-parser.util';
import type { KnowledgeNote, NoteSource, CategoryEntry, KnowledgeState } from '../types';

@Injectable()
export class KnowledgeService {
  private readonly readOnly: boolean;
  private readonly usersDir: string;
  private readonly logger = new Logger(KnowledgeService.name);

  // Stale-while-revalidate: one background rebuild per user at a time, throttled.
  private readonly backgroundRebuilds = new Map<string, Promise<KnowledgeState>>();
  private readonly lastRebuildAt = new Map<string, number>();
  private static readonly REBUILD_COOLDOWN_MS = 30_000;

  constructor(
    private readonly noteRepo: NoteFileRepository,
    private readonly flashcardsService: FlashcardsService,
    private readonly quizService: QuizService,
    private readonly searchService: SearchService,
    private readonly config: ConfigService,
  ) {
    this.readOnly = config.get<boolean>('readOnly');
    this.usersDir = config.get<string>('usersDir');
  }

  /**
   * Fast read path for GET /api/knowledge. Returns the cached index.json
   * immediately and triggers a background rebuild at most once per 30 seconds.
   * On first startup (no index.json yet), waits for the initial rebuild.
   */
  async getState(userId: string): Promise<KnowledgeState> {
    const cached = await this.noteRepo.readIndexJson(userId);

    const lastAt = this.lastRebuildAt.get(userId) ?? 0;
    const due = Date.now() - lastAt > KnowledgeService.REBUILD_COOLDOWN_MS;

    if (due && !this.backgroundRebuilds.has(userId)) {
      const p = this.rebuildIndexes(userId)
        .then((s) => { this.lastRebuildAt.set(userId, Date.now()); return s; })
        .catch((err: Error) => { this.logger.error(`Background rebuild failed: ${err.message}`); return cached!; })
        .finally(() => { this.backgroundRebuilds.delete(userId); });
      this.backgroundRebuilds.set(userId, p);
    }

    // If we have a cached snapshot, serve it immediately (background rebuild will update it).
    if (cached) return cached;

    // No cached state yet (first startup) — wait for the rebuild.
    return this.backgroundRebuilds.get(userId)!;
  }

  /**
   * Rebuilds every derived artifact from the markdown source of truth.
   *
   * Called after any note mutation (create, update, delete) and on startup.
   * Returns the complete knowledge state that the frontend consumes from
   * GET /api/knowledge.
   */
  async rebuildIndexes(userId: string): Promise<KnowledgeState> {
    const noteSources = await this.noteRepo.readAllSources(userId);

    // Migrate notes to the folder that matches their category front-matter.
    // This makes every create/update idempotent: the correct folder layout is
    // always restored, even when Codex writes a note to a flat location.
    if (!this.readOnly) {
      await this.migrateFolders(userId, noteSources);
    }

    const notes = noteSources.map((s) => s.note);
    const categories = this.buildCategories(notes);

    if (!this.readOnly) {
      await this.noteRepo.writeCategoryFiles(userId, categories);
    }

    // Graph edges only include links that resolve to an existing note.
    // Broken links remain in source markdown but are excluded from the graph.
    const noteIds = new Set(notes.map((n) => n.id));
    const graph = notes.map((note) => ({
      source: note.id,
      targets: note.links.filter((t) => noteIds.has(t)),
    }));

    const { allCards: flashcards, reviews } = await this.flashcardsService.loadEnrichedData(userId, noteSources);
    const enrichedFlashcards = flashcards.map((card) => {
      const review = reviews.get(card.id);
      if (!review) return card;
      return {
        ...card,
        reviewData: {
          easeFactor: review.easeFactor,
          interval: review.interval,
          repetitions: review.repetitions,
          nextReviewAt: review.nextReviewAt,
          lastReviewAt: review.lastReviewAt,
          lastRating: review.lastRating,
        },
      };
    });

    const { allQuestions, reviews: quizReviews } = await this.quizService.loadEnrichedData(userId, noteSources);
    const enrichedQuizQuestions = allQuestions.map((q) => {
      const review = quizReviews.get(q.id);
      if (!review) return q;
      return {
        ...q,
        reviewData: {
          nextReviewAt: review.nextReviewAt,
          lastReviewAt: review.lastReviewAt,
          lastRating: review.lastRating,
          streak: review.streak,
        },
      };
    });

    const state: KnowledgeState = { notes, categories, graph, flashcards: enrichedFlashcards, quizQuestions: enrichedQuizQuestions, updatedAt: new Date().toISOString() };

    if (!this.readOnly) {
      await this.noteRepo.writeIndexJson(userId, state);
      await this.searchService.sync(userId, notes).catch((err: Error) => {
        console.warn(`Search sync skipped: ${err.message}`);
      });
    }

    return state;
  }

  /**
   * Force-regenerates AI content for a single note without a full rebuild.
   * Bypasses the hash cache so the AI is called regardless of whether the
   * note has changed since the last generation.
   */
  async regenerateForNote(userId: string, noteId: string, target: 'flashcards' | 'quiz' | 'all'): Promise<void> {
    const allSources = await this.noteRepo.readAllSources(userId);
    const source = allSources.find((s) => s.note.id === noteId);
    if (!source) {
      const err: any = new Error(`note not found: ${noteId}`);
      err.status = 404;
      throw err;
    }
    const sources = [source];
    if (target === 'flashcards' || target === 'all') {
      await this.flashcardsService.sync(userId, sources, { force: true });
    }
    if (target === 'quiz' || target === 'all') {
      await this.quizService.sync(userId, sources, { force: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Moves note files whose on-disk path disagrees with their category
   * front-matter. This runs during every rebuild so even manual edits to
   * front-matter are eventually reflected in the folder tree.
   */
  private async migrateFolders(userId: string, sources: NoteSource[]): Promise<void> {
    const userNotesDir = join(this.usersDir, userId, 'notes');
    for (const source of sources) {
      const desired = noteRelativePath(source.note.id, source.note.category);
      if (source.file === desired) continue;

      const destination = join(userNotesDir, desired);
      await mkdir(dirname(destination), { recursive: true });

      if (existsSync(destination)) {
        const err: any = new Error(`cannot move ${source.file}; ${desired} already exists`);
        err.status = 409;
        throw err;
      }

      await this.noteRepo.move(userId, source.file, desired, source.markdown);
      source.file = desired;
      // Re-parse so subsequent steps use the updated path field.
      source.note = parseNote(desired, source.markdown);
    }
  }

  /**
   * Aggregates per-note metadata into the category hierarchy consumed by the
   * sidebar and category index pages.
   */
  private buildCategories(notes: KnowledgeNote[]): CategoryEntry[] {
    const map = new Map<string, CategoryEntry>();
    for (const note of notes) {
      const existing = map.get(note.category) || {
        name: note.category,
        slug: slugify(note.category),
        count: 0,
        summaries: [],
        notes: [],
      };
      existing.count += 1;
      existing.summaries.push(note.summary);
      existing.notes.push({ id: note.id, title: note.title, summary: note.summary });
      map.set(note.category, existing);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
}
