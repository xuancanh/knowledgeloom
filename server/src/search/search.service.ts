import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { KnowledgeNote, NoteSource, KnowledgeState } from '../types';

@Injectable()
export class SearchService {
  private readonly host: string;
  private readonly masterKey: string;
  private readonly index: string;
  private readonly syncPath: string;
  private readonly rootDir: string;
  private readonly readOnly: boolean;

  constructor(config: ConfigService) {
    this.host = config.get<string>('meiliHost');
    this.masterKey = config.get<string>('meiliMasterKey');
    this.index = config.get<string>('meiliIndex');
    this.syncPath = config.get<string>('meiliSyncPath');
    this.rootDir = config.get<string>('rootDir');
    this.readOnly = config.get<boolean>('readOnly');
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

  private async loadSyncManifest(): Promise<{ documents: Record<string, string> }> {
    if (!existsSync(this.syncPath)) return { documents: {} };
    try {
      return JSON.parse(await readFile(this.syncPath, 'utf8'));
    } catch {
      return { documents: {} };
    }
  }

  private async loadRemoteManifest(): Promise<{ documents: Record<string, string> }> {
    const result = await this.request(`/indexes/${this.index}/documents?limit=10000&fields=id`);
    const documents: Record<string, string> = {};
    for (const doc of result.results || []) {
      if (doc.id) documents[doc.id] = 'remote';
    }
    return { documents };
  }

  private async saveSyncManifest(documents: Record<string, string>): Promise<void> {
    if (this.readOnly) return;
    await writeFile(this.syncPath, JSON.stringify({ documents, updatedAt: new Date().toISOString() }, null, 2));
  }

  private hashDoc(doc: any): string {
    return createHash('sha256').update(JSON.stringify(doc)).digest('hex');
  }

  private async buildDocument(note: KnowledgeNote): Promise<any> {
    const markdown = await readFile(join(this.rootDir, note.path), 'utf8');
    return { ...note, body: markdown.replace(/^---[\s\S]*?---\s*/, '') };
  }

  async deleteDocument(id: string): Promise<{ deleted: number }> {
    if (this.readOnly || !id) return { deleted: 0 };
    await this.request(`/indexes/${this.index}/documents/${encodeURIComponent(id)}`, { method: 'DELETE' })
      .catch((err: Error) => {
        if (!err.message.includes('index_not_found') && !err.message.includes('document_not_found')) throw err;
      });
    const manifest = await this.loadSyncManifest();
    if (manifest.documents?.[id]) {
      const next = { ...manifest.documents };
      delete next[id];
      await this.saveSyncManifest(next);
    }
    return { deleted: 1 };
  }

  async sync(state: Pick<KnowledgeState, 'notes'>): Promise<{ mode: string; addedOrUpdated: number; deleted: number }> {
    if (this.readOnly) return { mode: 'read-only', addedOrUpdated: 0, deleted: 0 };

    await this.request('/indexes', {
      method: 'POST',
      body: JSON.stringify({ uid: this.index, primaryKey: 'id' }),
    }).catch((err: Error) => {
      if (!err.message.includes('index_already_exists')) throw err;
    });

    await this.request(`/indexes/${this.index}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        searchableAttributes: ['title', 'summary', 'category', 'tags', 'body'],
        filterableAttributes: ['category', 'tags'],
        sortableAttributes: ['createdAt', 'title'],
        displayedAttributes: ['id', 'title', 'summary', 'category', 'tags', 'links', 'createdAt', 'path'],
      }),
    });

    const documents = await Promise.all(state.notes.map((n) => this.buildDocument(n)));
    let manifest = await this.loadSyncManifest();
    if (!Object.keys(manifest.documents || {}).length) {
      manifest = await this.loadRemoteManifest().catch(() => manifest);
    }

    const nextManifest: Record<string, string> = {};
    const changed: any[] = [];

    for (const doc of documents) {
      const hash = this.hashDoc(doc);
      nextManifest[doc.id] = hash;
      if (manifest.documents?.[doc.id] !== hash) changed.push(doc);
    }

    const currentIds = new Set(documents.map((d) => d.id));
    const deletedIds = Object.keys(manifest.documents || {}).filter((id) => !currentIds.has(id));

    if (changed.length) {
      await this.request(`/indexes/${this.index}/documents`, { method: 'PUT', body: JSON.stringify(changed) });
    }
    await Promise.all(
      deletedIds.map((id) =>
        this.request(`/indexes/${this.index}/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
      ),
    );

    await this.saveSyncManifest(nextManifest);
    return { mode: 'incremental', addedOrUpdated: changed.length, deleted: deletedIds.length };
  }

  async search(query: string, category?: string): Promise<any[]> {
    const filter = category && category !== 'All'
      ? `category = "${category.replace(/"/g, '\\"')}"`
      : undefined;
    const result = await this.request(`/indexes/${this.index}/search`, {
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
