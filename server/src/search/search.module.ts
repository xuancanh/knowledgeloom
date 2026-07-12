/**
 * SearchModule — selects and provides the active SearchProvider.
 *
 * The SEARCH_PROVIDER environment variable controls which backend is used:
 *
 *   SEARCH_PROVIDER=meilisearch   (default) — Meilisearch incremental sync
 *   SEARCH_PROVIDER=inmemory              — In-process substring search
 *
 * Exports both SEARCH_PROVIDER (the active instance) and SearchService (a thin
 * façade that delegates to the provider). KnowledgeModule and the search
 * controller both depend on SearchService, not the provider directly, so they
 * remain decoupled from the active implementation.
 *
 * MeilisearchProvider injects NoteStorageProvider (for reading note bodies to
 * index). StorageModule must be imported by any module that also imports
 * SearchModule — or, if both are imported at the AppModule level, the global
 * StorageModule export is reused automatically.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageModule } from '../storage/storage.module';
import { NOTE_STORAGE } from '../storage/note-storage.interface';
import { MeilisearchProvider } from './meilisearch.provider';
import { InMemorySearchProvider } from './inmemory-search.provider';
import { SearchService } from './search.service';
import { SEARCH_PROVIDER } from './search-provider.interface';
import { SearchStatusRepository } from './search-status.repository';

const searchProviderFactory = {
  provide: SEARCH_PROVIDER,
  inject: [ConfigService, NOTE_STORAGE],
  useFactory: (config: ConfigService, storage: any) => {
    const backend = config.get<string>('searchProvider') || 'meilisearch';
    if (backend === 'inmemory') {
      return new InMemorySearchProvider();
    }
    return new MeilisearchProvider(config, storage);
  },
};

@Module({
  imports: [StorageModule],
  providers: [
    searchProviderFactory,
    MeilisearchProvider,
    InMemorySearchProvider,
    SearchService,
    SearchStatusRepository,
  ],
  exports: [SEARCH_PROVIDER, SearchService],
})
export class SearchModule {}
