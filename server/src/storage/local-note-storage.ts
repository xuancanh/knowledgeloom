/**
 * LocalNoteStorage — NoteStorageProvider backed by the local filesystem.
 *
 * This is the default storage implementation for development and self-hosted
 * deployments. Notes are stored as markdown files under `knowledge/notes/`,
 * organised into sub-directories that mirror the category hierarchy.
 *
 * All file operations are performed with Node.js `fs/promises` and are therefore
 * fully async, matching the NoteStorageProvider contract. Parent directories are
 * created automatically on write.
 *
 * Enabled when NOTE_STORAGE=local (or when NOTE_STORAGE is unset).
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import type { NoteStorageProvider } from './note-storage.interface';

@Injectable()
export class LocalNoteStorage implements NoteStorageProvider {
  private readonly notesDir: string;
  private readonly categoriesDir: string;
  private readonly indexPath: string;

  constructor(config: ConfigService) {
    this.notesDir = config.get<string>('notesDir');
    this.categoriesDir = config.get<string>('categoriesDir');
    this.indexPath = config.get<string>('indexPath');
  }

  async ensureStore(): Promise<void> {
    await mkdir(this.notesDir, { recursive: true });
    await mkdir(this.categoriesDir, { recursive: true });
    if (!existsSync(this.indexPath)) {
      await writeFile(this.indexPath, JSON.stringify({ notes: [], categories: [] }, null, 2));
    }
  }

  async listFiles(): Promise<string[]> {
    await this.ensureStore();
    return this.walkDir(this.notesDir, '');
  }

  async read(relativePath: string): Promise<string> {
    const content = await readFile(join(this.notesDir, relativePath), 'utf8');
    return content;
  }

  async write(relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.notesDir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }

  async move(fromRelative: string, toRelative: string, content: string): Promise<void> {
    const toPath = join(this.notesDir, toRelative);
    await mkdir(dirname(toPath), { recursive: true });
    if (existsSync(toPath)) {
      const err: any = new Error(`cannot move ${fromRelative}; ${toRelative} already exists`);
      err.status = 409;
      throw err;
    }
    await writeFile(toPath, content);
    await rm(join(this.notesDir, fromRelative), { force: true });
  }

  async delete(relativePath: string): Promise<void> {
    await rm(join(this.notesDir, relativePath), { force: true });
  }

  async exists(relativePath: string): Promise<boolean> {
    return existsSync(join(this.notesDir, relativePath));
  }

  private async walkDir(dir: string, prefix: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push(...(await this.walkDir(join(dir, entry.name), relative)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(relative);
      }
    }
    return files.sort();
  }
}
