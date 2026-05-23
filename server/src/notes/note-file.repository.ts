import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { parseNote, noteRelativePath } from '../common/note-parser.util';
import type { KnowledgeNote, NoteSource } from '../types';

@Injectable()
export class NoteFileRepository {
  private readonly notesDir: string;
  private readonly categoriesDir: string;
  private readonly indexPath: string;
  private readonly readOnly: boolean;

  constructor(config: ConfigService) {
    this.notesDir = config.get<string>('notesDir');
    this.categoriesDir = config.get<string>('categoriesDir');
    this.indexPath = config.get<string>('indexPath');
    this.readOnly = config.get<boolean>('readOnly');
  }

  async ensureStore(): Promise<void> {
    if (this.readOnly) return;
    await mkdir(this.notesDir, { recursive: true });
    await mkdir(this.categoriesDir, { recursive: true });
    if (!existsSync(this.indexPath)) {
      await writeFile(this.indexPath, JSON.stringify({ notes: [], categories: [] }, null, 2));
    }
  }

  async listFiles(dir = this.notesDir, prefix = ''): Promise<string[]> {
    await this.ensureStore();
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relative = join(prefix, entry.name);
      const absolute = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...(await this.listFiles(absolute, relative)));
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(relative);
    }
    return files.sort();
  }

  async findById(id: string): Promise<string | null> {
    const safeId = basename(id);
    const fileName = `${safeId}.md`;
    const files = await this.listFiles();
    return files.find((f) => basename(f) === fileName) || null;
  }

  async readAll(): Promise<KnowledgeNote[]> {
    await this.ensureStore();
    const files = await this.listFiles();
    const notes: KnowledgeNote[] = [];
    for (const file of files) {
      const markdown = await readFile(join(this.notesDir, file), 'utf8');
      notes.push(parseNote(file, markdown));
    }
    return notes;
  }

  async readAllSources(): Promise<NoteSource[]> {
    await this.ensureStore();
    const files = await this.listFiles();
    const sources: NoteSource[] = [];
    for (const file of files) {
      const markdown = await readFile(join(this.notesDir, file), 'utf8');
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
    return readFile(join(this.notesDir, file), 'utf8');
  }

  async write(relativePath: string, markdown: string): Promise<void> {
    const fullPath = join(this.notesDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, markdown);
  }

  async move(fromRelative: string, toRelative: string, markdown: string): Promise<void> {
    const toPath = join(this.notesDir, toRelative);
    await mkdir(dirname(toPath), { recursive: true });
    if (existsSync(toPath)) {
      const err: any = new Error(`cannot move ${fromRelative}; ${toRelative} already exists`);
      err.status = 409;
      throw err;
    }
    await writeFile(toPath, markdown);
    await rm(join(this.notesDir, fromRelative), { force: true });
  }

  async delete(relativePath: string): Promise<void> {
    await rm(join(this.notesDir, relativePath), { force: true });
  }

  async writeCategoryFiles(categories: any[]): Promise<void> {
    if (this.readOnly) return;
    const staleCategoryFiles = (await readdir(this.categoriesDir)).filter((f) => f.endsWith('.md'));
    await Promise.all(staleCategoryFiles.map((f) => rm(join(this.categoriesDir, f), { force: true })));
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
      await writeFile(join(this.categoriesDir, `${category.slug}.md`), body);
    }
  }

  async writeIndexJson(state: any): Promise<void> {
    if (this.readOnly) return;
    await writeFile(this.indexPath, JSON.stringify(state, null, 2));
  }
}
