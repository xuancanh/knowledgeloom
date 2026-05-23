/**
 * SearchModule — Meilisearch integration.
 *
 * SearchController depends on KnowledgeService for the fallback search path.
 * To avoid a circular import (KnowledgeModule → SearchModule → KnowledgeModule),
 * SearchController is declared in NotesModule rather than here.
 * SearchModule only exports SearchService so KnowledgeModule and NotesModule
 * can inject it.
 */
import { Module } from '@nestjs/common';
import { SearchService } from './search.service';

@Module({
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
