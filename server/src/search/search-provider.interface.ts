/**
 * SearchProvider — abstract interface for full-text search.
 *
 * Decouples KnowledgeService and SearchController from any specific search
 * engine. The application can switch search backends by changing a single
 * environment variable.
 *
 * Implementations ship out of the box:
 *
 *  - MeilisearchProvider  — Incremental sync to a per-user Meilisearch index.
 *                           Best for self-hosted setups with a running
 *                           Meilisearch Docker container.
 *
 *  - InMemorySearchProvider — In-process substring + tag search over the
 *                             current KnowledgeState snapshot. Zero deps,
 *                             zero infrastructure. Suitable for development,
 *                             read-only deployments, and as the automatic
 *                             fallback when Meilisearch is unreachable.
 *
 * The active implementation is selected by the SEARCH_PROVIDER env variable.
 *
 * @example .env
 *   # Meilisearch (default)
 *   SEARCH_PROVIDER=meilisearch
 *   MEILI_HOST=http://localhost:7700
 *   MEILI_MASTER_KEY=your-key          # optional
 *
 *   # No search infrastructure needed
 *   SEARCH_PROVIDER=inmemory
 */

import type { KnowledgeNote } from '../types';

export interface SearchDocument extends KnowledgeNote {
  /** Full markdown body (without frontmatter). Indexed for full-text search. */
  body?: string;
}

export interface SearchHit extends SearchDocument {
  /** Snippets of matched text, keyed by attribute (optional). */
  _formatted?: Partial<Record<keyof SearchDocument, string>>;
}

export interface SearchProvider {
  /**
   * Incrementally syncs the search index with the current note set.
   * Called by KnowledgeService.rebuildIndexes() after every mutation.
   *
   * @param userId  The authenticated user whose index to sync.
   * @param notes   Current set of notes to index.
   * @returns       Stats about the sync operation.
   */
  sync(userId: string, notes: KnowledgeNote[]): Promise<{ mode: string; addedOrUpdated: number; deleted: number }>;

  /**
   * Removes a single document from the search index.
   * Called immediately on note deletion so search results are accurate even
   * before the next full rebuild runs.
   */
  deleteDocument(userId: string, id: string): Promise<{ deleted: number }>;

  /**
   * Executes a search query and returns matching notes.
   *
   * @param userId    The authenticated user whose index to query.
   * @param query     Free-text search string (empty = all).
   * @param category  Optional category filter ('All' = no filter).
   */
  search(userId: string, query: string, category?: string): Promise<SearchHit[]>;
}

/** Injection token for the SearchProvider. */
export const SEARCH_PROVIDER = 'SEARCH_PROVIDER';
