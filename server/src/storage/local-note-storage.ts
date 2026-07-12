/**
 * LocalNoteStorage — NoteStorageProvider backed by the local filesystem.
 *
 * Notes are stored as markdown files under `knowledge/users/{userId}/notes/`,
 * organised into sub-directories that mirror the category hierarchy.
 *
 * All file operations are performed with Node.js `fs/promises` and are therefore
 * fully async, matching the NoteStorageProvider contract. Parent directories are
 * created automatically on write.
 *
 * Path traversal prevention: every resolved path is asserted to start with the
 * expected user directory prefix before any I/O is performed.
 *
 * Enabled when NOTE_STORAGE=local (or when NOTE_STORAGE is unset).
 */
import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, sep } from 'node:path';
import type { NoteStorageEntry, NoteStorageProvider } from './note-storage.interface';

@Injectable()
export class LocalNoteStorage implements NoteStorageProvider {
  private readonly usersDir: string;

  constructor(config: ConfigService) {
    this.usersDir = config.get<string>('usersDir'); // knowledge/users
  }

  private userNotesDir(userId: string): string {
    return join(this.usersDir, userId, 'notes');
  }

  /**
   * Security: verify path doesn't escape user's directory (path traversal prevention).
   */
  private assertUserPath(userId: string, fullPath: string): void {
    const expectedBase = join(this.usersDir, userId);
    const resolved = resolve(fullPath);
    if (!resolved.startsWith(expectedBase + sep) && resolved !== expectedBase) {
      throw new ForbiddenException('Path traversal attempt detected');
    }
  }

  async ensureStore(userId: string): Promise<void> {
    const notesDir = this.userNotesDir(userId);
    await mkdir(notesDir, { recursive: true });
  }

  async listFiles(userId: string): Promise<string[]> {
    return (await this.listEntries(userId)).map((entry) => entry.path);
  }

  async listEntries(userId: string): Promise<NoteStorageEntry[]> {
    const notesDir = this.userNotesDir(userId);
    await mkdir(notesDir, { recursive: true });
    return this.walkDir(notesDir, '');
  }

  async read(userId: string, relativePath: string): Promise<string> {
    const fullPath = join(this.userNotesDir(userId), relativePath);
    this.assertUserPath(userId, fullPath);
    return readFile(fullPath, 'utf8');
  }

  async write(userId: string, relativePath: string, content: string): Promise<void> {
    const fullPath = join(this.userNotesDir(userId), relativePath);
    this.assertUserPath(userId, fullPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }

  async move(userId: string, fromRelative: string, toRelative: string, content: string): Promise<void> {
    const fromPath = join(this.userNotesDir(userId), fromRelative);
    const toPath = join(this.userNotesDir(userId), toRelative);
    this.assertUserPath(userId, fromPath);
    this.assertUserPath(userId, toPath);
    await mkdir(dirname(toPath), { recursive: true });
    if (existsSync(toPath)) {
      const err: any = new Error(`cannot move ${fromRelative}; ${toRelative} already exists`);
      err.status = 409;
      throw err;
    }
    await writeFile(toPath, content);
    await rm(fromPath, { force: true });
  }

  async delete(userId: string, relativePath: string): Promise<void> {
    const fullPath = join(this.userNotesDir(userId), relativePath);
    this.assertUserPath(userId, fullPath);
    await rm(fullPath, { force: true });
  }

  async exists(userId: string, relativePath: string): Promise<boolean> {
    const fullPath = join(this.userNotesDir(userId), relativePath);
    this.assertUserPath(userId, fullPath);
    return existsSync(fullPath);
  }

  private async walkDir(dir: string, prefix: string): Promise<NoteStorageEntry[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: NoteStorageEntry[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        files.push(...(await this.walkDir(join(dir, entry.name), relative)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const metadata = await stat(join(dir, entry.name));
        files.push({
          path: relative,
          version: `${metadata.size}:${metadata.mtimeMs}:${metadata.ctimeMs}`,
        });
      }
    }
    return files.sort((a, b) => a.path.localeCompare(b.path));
  }
}
