/**
 * NoteFileRepository — application-level note repository.
 *
 * Sits between the service layer and NoteStorageProvider. It owns the
 * higher-level operations (find-by-id, read-all-sources, write category files,
 * write index JSON) while delegating raw file I/O to the injected storage
 * backend (local filesystem or S3-compatible).
 *
 * This separation keeps the storage interface minimal (read/write/list/delete)
 * while allowing the repository to add app-specific logic like note parsing,
 * source object assembly, and the category markdown format.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { basename } from 'node:path';
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { NOTE_STORAGE, NoteStorageProvider } from '../storage/note-storage.interface';
import { parseNote } from '../common/note-parser.util';
import type { KnowledgeNote, NoteSource } from '../types';

@Injectable()
export class NoteFileRepository {
  private readonly categoriesDir: string;
  private readonly indexPath: string;
  private readonly readOnly: boolean;

  constructor(
    @Inject(NOTE_STORAGE) private readonly storage: NoteStorageProvider,
    private readonly config: ConfigService,
  ) {
    this.categoriesDir = config.get<string>('categoriesDir');
    this.indexPath = config.get<string>('indexPath');
    this.readOnly = config.get<boolean>('readOnly');
  }

  async ensureStore(): Promise<void> {
    return this.storage.ensureStore();
  }

  async listFiles(): Promise<string[]> {
    return this.storage.listFiles();
  }

  async findById(id: string): Promise<string | null> {
    const safeId = basename(id);
    const fileName = `${safeId}.md`;
    const files = await this.storage.listFiles();
    return files.find((f) => basename(f) === fileName) || null;
  }

  async readAll(): Promise<KnowledgeNote[]> {
    await this.storage.ensureStore();
    const files = await this.storage.listFiles();
    const notes: KnowledgeNote[] = [];
    for (const file of files) {
      const markdown = await this.storage.read(file);
      notes.push(parseNote(file, markdown));
    }
    return notes;
  }

  async readAllSources(): Promise<NoteSource[]> {
    await this.storage.ensureStore();
    const files = await this.storage.listFiles();
    const sources: NoteSource[] = [];
    for (const file of files) {
      const markdown = await this.storage.read(file);
      sources.push({ file, markdown, note: parseNote(file, markdown) });
    }
    return sources;
  }

  async readMarkdown(id: string): Promise<string> {
    const file = await this.findById(id);
    if (!file) {
      const err: any = new Error('note not found');
      err.status = 404;
      throw err;
    }
    return this.storage.read(file);
  }

  async write(relativePath: string, markdown: string): Promise<void> {
    return this.storage.write(relativePath, markdown);
  }

  async move(fromRelative: string, toRelative: string, markdown: string): Promise<void> {
    return this.storage.move(fromRelative, toRelative, markdown);
  }

  async delete(relativePath: string): Promise<void> {
    return this.storage.delete(relativePath);
  }

  async writeCategoryFiles(categories: any[]): Promise<void> {
    if (this.readOnly) return;
    // Category files are only written to local fs for now.
    // S3 deployments rely on the JSON index instead of category markdown files.
    try {
      const { readdir, rm, writeFile } = await import('node:fs/promises');
      const staleCategoryFiles = (await readdir(this.categoriesDir)).filter((f) => f.endsWith('.md'));
      await Promise.all(staleCategoryFiles.map((f) => rm(`${this.categoriesDir}/${f}`, { force: true })));
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
        await writeFile(`${this.categoriesDir}/${category.slug}.md`, body);
      }
    } catch {
      // Category files are non-critical in S3 or read-only mode.
    }
  }

  async writeIndexJson(state: any): Promise<void> {
    if (this.readOnly) return;
    try {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(this.indexPath, JSON.stringify(state, null, 2));
    } catch {
      // Non-critical in S3-only setups.
    }
  }
}
