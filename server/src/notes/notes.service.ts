/**
 * NotesService — CRUD operations for individual markdown notes.
 *
 * Keeps the markdown file as the canonical source; every mutation ends with a
 * call to KnowledgeService.rebuildIndexes() so the category tree, Meilisearch,
 * and index.json converge on the new state.
 *
 * The service also delegates AI edit proposals to CodexService. Proposals are
 * returned to the client; the user reviews them before saving through update().
 *
 * All methods require a userId parameter — data is scoped per user.
 */
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { basename } from 'node:path';
import { NoteFileRepository } from './note-file.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { RemindersService } from '../reminders/reminders.service';
import { SearchService } from '../search/search.service';
import { CodexService } from '../codex/codex.service';
import { JobsService } from '../jobs/jobs.service';
import {
  parseNote,
  composeMarkdown,
  stripFrontmatter,
  noteRelativePath,
  uniqueNoteSlug,
} from '../common/note-parser.util';
import type { KnowledgeNote } from '../types';

@Injectable()
export class NotesService {
  private readonly readOnly: boolean;

  constructor(
    private readonly noteRepo: NoteFileRepository,
    private readonly knowledgeService: KnowledgeService,
    private readonly remindersService: RemindersService,
    private readonly searchService: SearchService,
    private readonly codexService: CodexService,
    private readonly jobsService: JobsService,
    private readonly config: ConfigService,
  ) {
    this.readOnly = config.get<boolean>('readOnly');
  }

  /** Returns the raw markdown for the editor. */
  async getMarkdown(userId: string, id: string): Promise<string> {
    return this.noteRepo.readMarkdown(userId, basename(id));
  }

  /**
   * Creates a note from user-authored content without invoking Codex.
   * Routes through the same markdown composer and index rebuild as AI-created
   * notes so direct notes behave identically in category pages and search.
   */
  async createFromDraft(userId: string, draft: any): Promise<any> {
    this.assertWritable();
    const title = String(draft.title || '').trim();
    const body = String(draft.body || '').trim();
    if (!title || !body) throw new BadRequestException('title and body are required');

    // Build user notes dir path for slug uniqueness check
    const usersDir = this.config.get<string>('usersDir');
    const userNotesDir = require('node:path').join(usersDir, userId, 'notes');
    const slug = uniqueNoteSlug(title, userNotesDir);
    const markdown = composeMarkdown({
      title,
      category: draft.category || 'Uncategorized',
      summary: draft.summary || '',
      tags: draft.tags || [],
      links: draft.links || [],
      createdAt: draft.createdAt || new Date().toISOString(),
      body,
    });

    const relativePath = noteRelativePath(slug, draft.category || 'Uncategorized');
    await this.noteRepo.write(userId, relativePath, markdown);

    const state = await this.knowledgeService.rebuildIndexes(userId);
    const note = state.notes.find((n) => n.id === slug);
    return { note, state, markdown, codexStatus: 'not-used' };
  }

  /**
   * Rewrites one note file from editor data and triggers a full rebuild.
   * Handles category-driven file moves transparently.
   */
  async update(userId: string, id: string, updates: any): Promise<any> {
    this.assertWritable();
    const safeId = basename(id);
    const currentFile = await this.noteRepo.findById(userId, safeId);
    if (!currentFile) throw new NotFoundException('note not found');

    const currentMarkdown = await this.noteRepo.readMarkdown(userId, safeId);
    const current = parseNote(currentFile, currentMarkdown);

    const markdown = composeMarkdown({
      title: updates.title ?? current.title,
      category: updates.category ?? current.category,
      summary: updates.summary ?? current.summary,
      tags: updates.tags ?? current.tags,
      links: updates.links ?? current.links,
      createdAt: updates.createdAt ?? current.createdAt,
      sourceUrl: updates.sourceUrl ?? current.sourceUrl,
      originalRequest: updates.originalRequest ?? current.originalRequest,
      body: updates.body ?? stripFrontmatter(currentMarkdown),
    });

    const nextCategory = updates.category ?? current.category;
    const nextFile = noteRelativePath(safeId, nextCategory);
    await this.noteRepo.write(userId, nextFile, markdown);
    if (nextFile !== currentFile) {
      await this.noteRepo.delete(userId, currentFile);
    }

    const state = await this.knowledgeService.rebuildIndexes(userId);
    const note = state.notes.find((n) => n.id === safeId);
    return { note, state, markdown };
  }

  /**
   * Deletes a note file, removes associated reminders, cleans Meilisearch, and
   * rebuilds the index. Meilisearch cleanup is explicit so the removed note
   * disappears from search immediately even when the sync manifest is stale.
   */
  async delete(userId: string, id: string): Promise<any> {
    this.assertWritable();
    const safeId = basename(id);
    const currentFile = await this.noteRepo.findById(userId, safeId);
    if (!currentFile) throw new NotFoundException('note not found');

    await this.noteRepo.delete(userId, currentFile);
    await this.remindersService.removeForNote(userId, safeId);
    await this.searchService.deleteDocument(userId, safeId).catch((err: Error) => {
      console.warn(`Meilisearch delete skipped for ${safeId}: ${err.message}`);
    });

    const state = await this.knowledgeService.rebuildIndexes(userId);
    return { deleted: safeId, state };
  }

  /**
   * Asks CodexService to produce an edit proposal for the given note.
   * The proposal is returned to the client; writing to disk happens only when
   * the user explicitly saves through update().
   */
  async assistDraft(draft: any, instruction: string): Promise<any> {
    this.assertWritable();
    return this.codexService.assistDraft(draft, instruction);
  }

  async assistEdit(id: string, draft: any, instruction: string): Promise<any> {
    this.assertWritable();
    return this.codexService.assistEdit(id, draft, instruction);
  }

  async enqueueRegenerate(userId: string, id: string, target: 'flashcards' | 'quiz' | 'all', size: 'small' | 'medium' | 'large' = 'small'): Promise<any> {
    this.assertWritable();
    const safeId = basename(id);
    const file = await this.noteRepo.findById(userId, safeId);
    if (!file) throw new NotFoundException('note not found');
    const markdown = await this.noteRepo.readMarkdown(userId, safeId);
    const { parseNote } = await import('../common/note-parser.util');
    const note = parseNote(file, markdown);
    const targetLabel = target === 'all' ? 'flashcards + quiz' : target;
    return this.jobsService.enqueue(userId, {
      mode: 'regen',
      topic: `Regenerate ${targetLabel} (${size}): ${note.title}`,
      noteId: safeId,
      regenTarget: target,
      regenSize: size,
    });
  }

  private assertWritable(): void {
    if (this.readOnly) throw new ForbiddenException('service is running in read-only mode');
  }
}
