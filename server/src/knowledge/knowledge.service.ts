/**
 * KnowledgeService — the "rebuild pipeline" that keeps every derived artifact
 * in sync with the markdown source of truth.
 *
 * Responsibilities:
 *  1. Read all note files via NoteFileRepository.
 *  2. Migrate note files to the correct category folder when the category
 *     front-matter changes (e.g. after an AI edit).
 *  3. Build the category hierarchy from the collected note metadata.
 *  4. Delegate AI flashcard generation to FlashcardsService.
 *  5. Push incremental updates to Meilisearch via SearchService.
 *  6. Persist the canonical index.json snapshot consumed by the frontend.
 *
 * This service is intentionally free of HTTP concerns; every mutating route
 * calls it at the end to settle the knowledge graph into a consistent state.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { NoteFileRepository } from '../notes/note-file.repository';
import { FlashcardsService } from '../flashcards/flashcards.service';
import { SearchService } from '../search/search.service';
import { slugify, parseNote, noteRelativePath } from '../common/note-parser.util';
import type { KnowledgeNote, NoteSource, CategoryEntry, KnowledgeState } from '../types';

@Injectable()
export class KnowledgeService {
  private readonly readOnly: boolean;
  private readonly notesDir: string;

  constructor(
    private readonly noteRepo: NoteFileRepository,
    private readonly flashcardsService: FlashcardsService,
    private readonly searchService: SearchService,
    private readonly config: ConfigService,
  ) {
    this.readOnly = config.get<boolean>('readOnly');
    this.notesDir = config.get<string>('notesDir');
  }

  /**
   * Rebuilds every derived artifact from the markdown source of truth.
   *
   * Called after any note mutation (create, update, delete) and on startup.
   * Returns the complete knowledge state that the frontend consumes from
   * GET /api/knowledge.
   */
  async rebuildIndexes(): Promise<KnowledgeState> {
    const noteSources = await this.noteRepo.readAllSources();

    // Migrate notes to the folder that matches their category front-matter.
    // This makes every create/update idempotent: the correct folder layout is
    // always restored, even when Codex writes a note to a flat location.
    if (!this.readOnly) {
      await this.migrateFolders(noteSources);
    }

    const notes = noteSources.map((s) => s.note);
    const categories = this.buildCategories(notes);

    if (!this.readOnly) {
      await this.noteRepo.writeCategoryFiles(categories);
    }

    // Graph edges only include links that resolve to an existing note.
    // Broken links remain in source markdown but are excluded from the graph.
    const noteIds = new Set(notes.map((n) => n.id));
    const graph = notes.map((note) => ({
      source: note.id,
      targets: note.links.filter((t) => noteIds.has(t)),
    }));

    const flashcards = await this.flashcardsService.sync(noteSources);
    const state: KnowledgeState = { notes, categories, graph, flashcards, updatedAt: new Date().toISOString() };

    if (!this.readOnly) {
      await this.noteRepo.writeIndexJson(state);
      await this.searchService.sync(notes).catch((err: Error) => {
        console.warn(`Search sync skipped: ${err.message}`);
      });
    }

    return state;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Moves note files whose on-disk path disagrees with their category
   * front-matter. This runs during every rebuild so even manual edits to
   * front-matter are eventually reflected in the folder tree.
   */
  private async migrateFolders(sources: NoteSource[]): Promise<void> {
    for (const source of sources) {
      const desired = noteRelativePath(source.note.id, source.note.category);
      if (source.file === desired) continue;

      const destination = join(this.notesDir, desired);
      await mkdir(dirname(destination), { recursive: true });

      if (existsSync(destination)) {
        const err: any = new Error(`cannot move ${source.file}; ${desired} already exists`);
        err.status = 409;
        throw err;
      }

      await this.noteRepo.move(source.file, desired, source.markdown);
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
