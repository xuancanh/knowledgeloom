/**
 * InMemorySearchProvider — zero-dependency search over the in-memory note index.
 *
 * Performs a case-insensitive substring match across title, summary, and tags.
 * No external process, no network calls, no infrastructure required.
 *
 * Data is stored per user in a Map<userId, KnowledgeNote[]> so users never
 * see each other's notes.
 *
 * Suitable for:
 *  - Local development without a running Meilisearch container
 *  - Read-only cloud deployments where Meilisearch is unavailable
 *  - Testing and CI environments
 *
 * Limitations compared to Meilisearch:
 *  - No typo tolerance or relevance ranking
 *  - No body text search (only title, summary, tags)
 *  - Sync is a no-op (the state is rebuilt on every GET /api/knowledge call)
 *
 * Enabled when SEARCH_PROVIDER=inmemory.
 */
import { Injectable } from '@nestjs/common';
import type { SearchProvider, SearchHit } from './search-provider.interface';
import type { KnowledgeNote } from '../types';

@Injectable()
export class InMemorySearchProvider implements SearchProvider {
  /** Per-user note snapshot — updated on every sync() call. */
  private readonly store = new Map<string, KnowledgeNote[]>();

  async sync(userId: string, notes: KnowledgeNote[]): Promise<{ mode: string; addedOrUpdated: number; deleted: number }> {
    const prev = (this.store.get(userId) || []).length;
    this.store.set(userId, notes);
    return { mode: 'inmemory', addedOrUpdated: notes.length - prev, deleted: 0 };
  }

  async deleteDocument(userId: string, id: string): Promise<{ deleted: number }> {
    const notes = this.store.get(userId) || [];
    const before = notes.length;
    this.store.set(userId, notes.filter((n) => n.id !== id));
    return { deleted: before - (this.store.get(userId) || []).length };
  }

  async search(userId: string, query: string, category?: string): Promise<SearchHit[]> {
    const notes = this.store.get(userId) || [];
    const normalized = (query || '').toLowerCase();
    return notes
      .filter((note) => {
        const inCategory = !category || category === 'All' || note.category === category;
        if (!inCategory) return false;
        if (!normalized) return true;
        const haystack = `${note.title} ${note.summary} ${note.tags.join(' ')}`.toLowerCase();
        return haystack.includes(normalized);
      })
      .slice(0, 50);
  }
}
