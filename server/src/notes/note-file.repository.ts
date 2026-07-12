/**
 * NoteFileRepository — application-level note repository.
 *
 * Sits between the service layer and NoteStorageProvider. It owns the
 * higher-level operations (find-by-id, read-all-sources, write category files,
 * write index JSON) while delegating raw file I/O to the injected storage
 * backend (local filesystem or S3-compatible).
 *
 * Every public method requires a userId and scopes all operations to that user's
 * namespace. Data for one user is never accessible to another.
 */
import { Injectable, Inject, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { basename, join } from 'node:path';
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { NOTE_STORAGE, NoteStorageProvider } from '../storage/note-storage.interface';
import { parseNote } from '../common/note-parser.util';
import { NoteSourceCache } from './note-source-cache';
import type { KnowledgeNote, NoteSource } from '../types';

@Injectable()
export class NoteFileRepository {
  private readonly usersDir: string;
  private readonly readOnly: boolean;
  private readonly sourceCache: NoteSourceCache;
  private readonly readConcurrency: number;

  constructor(
    @Inject(NOTE_STORAGE) private readonly storage: NoteStorageProvider,
    private readonly config: ConfigService,
  ) {
    this.usersDir = config.get<string>('usersDir');
    this.readOnly = config.get<boolean>('readOnly');
    this.sourceCache = new NoteSourceCache(config.get<number>('noteSourceCacheMaxBytes'));
    this.readConcurrency = config.get<number>('noteReadConcurrency');
  }

  async ensureStore(userId: string): Promise<void> {
    return this.storage.ensureStore(userId);
  }

  async listFiles(userId: string): Promise<string[]> {
    return this.storage.listFiles(userId);
  }

  async findById(userId: string, id: string): Promise<string | null> {
    const safeId = basename(id);
    const fileName = `${safeId}.md`;
    const files = await this.storage.listFiles(userId);
    const found = files.find((f) => basename(f) === fileName);
    // Double-check: the relative path must not escape this user's namespace
    if (found && found.includes('..')) {
      throw new ForbiddenException('Invalid note path');
    }
    return found || null;
  }

  async readAll(userId: string): Promise<KnowledgeNote[]> {
    return (await this.readAllSources(userId)).map((source) => source.note);
  }

  async readAllSources(userId: string): Promise<NoteSource[]> {
    await this.storage.ensureStore(userId);
    const entries = await this.storage.listEntries(userId);
    this.sourceCache.retain(userId, new Set(entries.map((entry) => entry.path)));
    const sources = new Array<NoteSource>(entries.length);
    for (let offset = 0; offset < entries.length; offset += this.readConcurrency) {
      await Promise.all(entries.slice(offset, offset + this.readConcurrency).map(async (entry, batchIndex) => {
        const index = offset + batchIndex;
        const cached = this.sourceCache.get(userId, entry.path, entry.version);
        if (cached) {
          sources[index] = { file: entry.path, markdown: cached.markdown, note: cached.note };
          return;
        }
        const markdown = await this.storage.read(userId, entry.path);
        const note = parseNote(entry.path, markdown);
        this.sourceCache.set(userId, entry.path, { version: entry.version, markdown, note });
        sources[index] = { file: entry.path, markdown, note };
      }));
    }
    return sources;
  }

  async readMarkdown(userId: string, id: string): Promise<string> {
    const file = await this.findById(userId, id);
    if (!file) {
      const err: any = new Error('note not found');
      err.status = 404;
      throw err;
    }
    return this.storage.read(userId, file);
  }

  async write(userId: string, relativePath: string, markdown: string): Promise<void> {
    await this.storage.write(userId, relativePath, markdown);
    this.sourceCache.invalidate(userId, relativePath);
  }

  async exists(userId: string, relativePath: string): Promise<boolean> {
    return this.storage.exists(userId, relativePath);
  }

  async move(userId: string, fromRelative: string, toRelative: string, markdown: string): Promise<void> {
    await this.storage.move(userId, fromRelative, toRelative, markdown);
    this.sourceCache.invalidate(userId, fromRelative);
    this.sourceCache.invalidate(userId, toRelative);
  }

  async delete(userId: string, relativePath: string): Promise<void> {
    await this.storage.delete(userId, relativePath);
    this.sourceCache.invalidate(userId, relativePath);
  }

  clearSourceCache(userId: string): void {
    this.sourceCache.invalidate(userId);
  }

  async writeCategoryFiles(userId: string, categories: any[]): Promise<void> {
    if (this.readOnly) return;
    // Category files are only written to local fs for now.
    // S3 deployments rely on the JSON index instead of category markdown files.
    try {
      const categoriesDir = join(this.usersDir, userId, 'categories');
      await mkdir(categoriesDir, { recursive: true });
      const staleCategoryFiles = (await readdir(categoriesDir)).filter((f) => f.endsWith('.md'));
      await Promise.all(staleCategoryFiles.map((f) => rm(`${categoriesDir}/${f}`, { force: true })));
      for (const category of categories) {
        const body = [
          `# ${category.name}`,
          '',
          `Summary: ${category.summaries.filter(Boolean).slice(0, 4).join(' ') || 'No summary yet.'}`,
          '',
          '## Notes',
          '',
          ...category.notes.map((note: any) => `- [[${note.id}]] ${note.title} - ${note.summary}`),
          '',
        ].join('\n');
        await writeFile(`${categoriesDir}/${category.slug}.md`, body);
      }
    } catch {
      // Category files are non-critical in S3 or read-only mode.
    }
  }

  async readIndexJson(userId: string): Promise<any | null> {
    try {
      const indexPath = join(this.usersDir, userId, 'index.json');
      const content = await readFile(indexPath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async writeIndexJson(userId: string, state: any): Promise<void> {
    if (this.readOnly) return;
    try {
      const indexPath = join(this.usersDir, userId, 'index.json');
      await mkdir(join(this.usersDir, userId), { recursive: true });
      await writeFile(indexPath, JSON.stringify(state, null, 2));
    } catch {
      // Non-critical in S3-only setups.
    }
  }
}
