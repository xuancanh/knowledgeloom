/**
 * InMemorySearchProvider — zero-dependency search over the in-memory note index.
 *
 * Performs a case-insensitive substring match across title, summary, and tags.
 * No external process, no network calls, no infrastructure required.
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
  /** Current note snapshot — updated on every sync() call. */
  private notes: KnowledgeNote[] = [];

  async sync(notes: KnowledgeNote[]): Promise<{ mode: string; addedOrUpdated: number; deleted: number }> {
    const prev = this.notes.length;
    this.notes = notes;
    return { mode: 'inmemory', addedOrUpdated: notes.length - prev, deleted: 0 };
  }

  async deleteDocument(id: string): Promise<{ deleted: number }> {
    const before = this.notes.length;
    this.notes = this.notes.filter((n) => n.id !== id);
    return { deleted: before - this.notes.length };
  }

  async search(query: string, category?: string): Promise<SearchHit[]> {
    const normalized = (query || '').toLowerCase();
    return this.notes
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
