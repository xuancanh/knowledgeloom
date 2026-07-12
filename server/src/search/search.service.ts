/**
 * SearchService — thin façade over the active SearchProvider.
 *
 * Services and controllers inject SearchService rather than SEARCH_PROVIDER
 * directly. The façade adds a layer of indirection that makes it easy to add
 * cross-cutting concerns (logging, metrics, error wrapping) without touching
 * the provider implementations or their callers.
 *
 * Every method requires a userId so searches are scoped to the authenticated
 * user's notes only.
 *
 * The underlying provider (Meilisearch or InMemory) is selected at startup
 * by SearchModule based on the SEARCH_PROVIDER environment variable.
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import { SEARCH_PROVIDER, SearchProvider, SearchHit } from './search-provider.interface';
import type { KnowledgeNote, SearchStatus } from '../types';
import { SearchStatusRepository } from './search-status.repository';
import { degradedSearchStatus, healthySearchStatus } from './search-status.util';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(
    @Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider,
    private readonly statuses: SearchStatusRepository,
  ) {}

  /** Human-readable name of the active provider, e.g. "meilisearch" or "inmemory". */
  engineName(): string {
    return this.provider.constructor.name.replace(/SearchProvider$|Provider$/, '').toLowerCase() || 'unknown';
  }

  async sync(userId: string, notes: KnowledgeNote[]) {
    const engine = this.engineName();
    const attemptedAt = new Date().toISOString();
    const previous = await this.statuses.get(userId, engine);
    try {
      const result = await this.provider.sync(userId, notes);
      await this.saveStatus(userId, healthySearchStatus(engine, attemptedAt));
      return result;
    } catch (error) {
      await this.saveStatus(userId, degradedSearchStatus(
        engine,
        attemptedAt,
        previous.lastSuccessAt,
        error,
      ));
      throw error;
    }
  }

  getStatus(userId: string): Promise<SearchStatus> {
    return this.statuses.get(userId, this.engineName());
  }

  deleteDocument(userId: string, id: string) {
    return this.provider.deleteDocument(userId, id);
  }

  search(userId: string, query: string, category?: string): Promise<SearchHit[]> {
    return this.provider.search(userId, query, category);
  }

  private async saveStatus(userId: string, status: SearchStatus): Promise<void> {
    await this.statuses.save(userId, status).catch((error: Error) => {
      this.logger.warn(`Could not persist search status: ${error.message}`);
    });
  }
}
