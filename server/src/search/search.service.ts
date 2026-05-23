/**
 * SearchService — thin façade over the active SearchProvider.
 *
 * Services and controllers inject SearchService rather than SEARCH_PROVIDER
 * directly. The façade adds a layer of indirection that makes it easy to add
 * cross-cutting concerns (logging, metrics, error wrapping) without touching
 * the provider implementations or their callers.
 *
 * The underlying provider (Meilisearch or InMemory) is selected at startup
 * by SearchModule based on the SEARCH_PROVIDER environment variable.
 */
import { Injectable, Inject } from '@nestjs/common';
import { SEARCH_PROVIDER, SearchProvider, SearchHit } from './search-provider.interface';
import type { KnowledgeNote } from '../types';

@Injectable()
export class SearchService {
  constructor(@Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider) {}

  sync(notes: KnowledgeNote[]) {
    return this.provider.sync(notes);
  }

  deleteDocument(id: string) {
    return this.provider.deleteDocument(id);
  }

  search(query: string, category?: string): Promise<SearchHit[]> {
    return this.provider.search(query, category);
  }
}
