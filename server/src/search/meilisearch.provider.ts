/**
 * MeilisearchProvider — SearchProvider backed by a Meilisearch instance.
 *
 * Each user gets a separate Meilisearch index named `knowledge_notes_{userId_safe}`
 * where userId_safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40).
 * This provides complete data isolation at the search index level.
 *
 * Syncs notes incrementally using a per-user local manifest stored at
 * `knowledge/users/{userId}/meili-sync-{index_safe}.json`. Only changed
 * documents are sent on each rebuild, keeping sync fast even for large
 * note collections.
 *
 * The provider handles first-time setup (creates the index if absent,
 * applies searchable/filterable attribute settings) and gracefully ignores
 * "index_already_exists" and "document_not_found" errors from Meilisearch.
 *
 * Enabled when SEARCH_PROVIDER=meilisearch (the default).
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { NOTE_STORAGE } from '../storage/note-storage.interface';
import { Inject } from '@nestjs/common';
import type { NoteStorageProvider } from '../storage/note-storage.interface';
import type { SearchProvider, SearchDocument, SearchHit } from './search-provider.interface';
import type { KnowledgeNote } from '../types';

@Injectable()
export class MeilisearchProvider implements SearchProvider {
  private readonly host: string;
  private readonly masterKey: string;
  private readonly usersDir: string;
  private readonly readOnly: boolean;

  constructor(
    config: ConfigService,
    @Inject(NOTE_STORAGE) private readonly storage: NoteStorageProvider,
  ) {
    this.host = config.get<string>('meiliHost');
    this.masterKey = config.get<string>('meiliMasterKey');
    this.usersDir = config.get<string>('usersDir');
    this.readOnly = config.get<boolean>('readOnly');
  }

  private userIndex(userId: string): string {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
    return `knowledge_notes_${safe}`;
  }

  private userSyncPath(userId: string): string {
    const indexSafe = this.userIndex(userId).replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.usersDir, userId, `meili-sync-${indexSafe}.json`);
  }

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      ...(this.masterKey ? { Authorization: `Bearer ${this.masterKey}` } : {}),
    };
  }

  private async request(pathname: string, options: RequestInit = {}): Promise<any> {
    const response = await fetch(`${this.host}${pathname}`, {
      ...options,
      headers: { ...this.headers(), ...(options.headers as any || {}) },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meilisearch ${response.status}: ${text}`);
    }
    return response.json();
  }

  private async loadManifest(userId: string): Promise<Record<string, string>> {
    const syncPath = this.userSyncPath(userId);
    if (!existsSync(syncPath)) return {};
    try {
      const raw = JSON.parse(await readFile(syncPath, 'utf8'));
      return raw.documents || {};
    } catch {
      return {};
    }
  }

  private async saveManifest(userId: string, documents: Record<string, string>): Promise<void> {
    if (this.readOnly) return;
    const syncPath = this.userSyncPath(userId);
    await mkdir(join(this.usersDir, userId), { recursive: true });
    await writeFile(syncPath, JSON.stringify({ documents, updatedAt: new Date().toISOString() }, null, 2));
  }

  private hash(doc: any): string {
    return createHash('sha256').update(JSON.stringify(doc)).digest('hex');
  }

  private async buildDocument(userId: string, note: KnowledgeNote): Promise<SearchDocument> {
    try {
      // The note.path is like `knowledge/users/{userId}/notes/Engineering/note.md`
      // but storage.read expects a relative path like `Engineering/note.md`
      const userNotesPrefix = `knowledge/users/${userId}/notes/`;
      const relativePath = note.path.startsWith(userNotesPrefix)
        ? note.path.slice(userNotesPrefix.length)
        : note.path.replace(/^.*\/notes\//, '');
      const markdown = await this.storage.read(userId, relativePath);
      return { ...note, body: markdown.replace(/^---[\s\S]*?---\s*/, '') };
    } catch {
      return { ...note, body: '' };
    }
  }

  async sync(userId: string, notes: KnowledgeNote[]): Promise<{ mode: string; addedOrUpdated: number; deleted: number }> {
    if (this.readOnly) return { mode: 'read-only', addedOrUpdated: 0, deleted: 0 };

    const index = this.userIndex(userId);

    // Ensure index exists with correct settings.
    await this.request('/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid: index, primaryKey: 'id' }),
    }).catch((err: Error) => {
      if (!err.message.includes('index_already_exists')) throw err;
    });

    await this.request(`/indexes/${index}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        searchableAttributes: ['title', 'summary', 'category', 'tags', 'body'],
        filterableAttributes: ['category', 'tags'],
        sortableAttributes: ['createdAt', 'title'],
        displayedAttributes: ['id', 'title', 'summary', 'category', 'tags', 'links', 'createdAt', 'path'],
      }),
    });

    const documents = await Promise.all(notes.map((n) => this.buildDocument(userId, n)));
    const manifest = await this.loadManifest(userId);

    // Bootstrap: if local manifest is empty, seed from remote ids.
    if (!Object.keys(manifest).length) {
      const remote = await this.request(`/indexes/${index}/documents?limit=10000&fields=id`)
        .catch(() => ({ results: [] }));
      for (const doc of remote.results || []) {
        if (doc.id) manifest[doc.id] = 'remote';
      }
    }

    const nextManifest: Record<string, string> = {};
    const changed: SearchDocument[] = [];

    for (const doc of documents) {
      const h = this.hash(doc);
      nextManifest[doc.id] = h;
      if (manifest[doc.id] !== h) changed.push(doc);
    }

    const currentIds = new Set(documents.map((d) => d.id));
    const deletedIds = Object.keys(manifest).filter((id) => !currentIds.has(id) && manifest[id] !== 'remote');

    if (changed.length) {
      await this.request(`/indexes/${index}/documents`, { method: 'PUT', body: JSON.stringify(changed) });
    }
    await Promise.all(
      deletedIds.map((id) =>
        this.request(`/indexes/${index}/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}),
      ),
    );

    await this.saveManifest(userId, nextManifest);
    return { mode: 'incremental', addedOrUpdated: changed.length, deleted: deletedIds.length };
  }

  async deleteDocument(userId: string, id: string): Promise<{ deleted: number }> {
    if (this.readOnly || !id) return { deleted: 0 };
    const index = this.userIndex(userId);
    await this.request(`/indexes/${index}/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .catch((err: Error) => {
        if (!err.message.includes('index_not_found') && !err.message.includes('document_not_found')) throw err;
      });
    const manifest = await this.loadManifest(userId);
    if (manifest[id]) {
      delete manifest[id];
      await this.saveManifest(userId, manifest);
    }
    return { deleted: 1 };
  }

  async search(userId: string, query: string, category?: string): Promise<SearchHit[]> {
    const index = this.userIndex(userId);
    const filter = category && category !== 'All'
      ? `category = "${category.replace(/"/g, '\\"')}"`
      : undefined;
    const result = await this.request(`/indexes/${index}/search`, {
      method: 'POST',
      body: JSON.stringify({
        q: query || '',
        limit: 50,
        filter,
        attributesToHighlight: ['title', 'summary', 'body'],
      }),
    });
    return result.hits || [];
  }
}
