/**
 * SearchController — full-text search via Meilisearch with fallback.
 *
 * GET /api/search?q=<query>&category=<category>
 *
 * Tries Meilisearch first. If Meilisearch is unavailable (not running, network
 * error) it falls back to a simple in-memory substring match over the
 * KnowledgeService snapshot so search stays functional in offline mode.
 */
import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { KnowledgeService } from '../knowledge/knowledge.service';

@Controller('api/search')
export class SearchController {
  constructor(
    private readonly searchService: SearchService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  @Get()
  async search(@Query('q') q = '', @Query('category') category = 'All') {
    try {
      const hits = await this.searchService.search(q, category);
      return { engine: 'meilisearch', hits };
    } catch (err: any) {
      // Graceful fallback: in-memory substring search over the current index.
      const state = await this.knowledgeService.rebuildIndexes();
      const normalized = q.toLowerCase();
      const hits = state.notes.filter((note) => {
        const inCategory = category === 'All' || note.category === category;
        const haystack = `${note.title} ${note.summary} ${note.tags.join(' ')}`.toLowerCase();
        return inCategory && (!normalized || haystack.includes(normalized));
      });
      return { engine: 'fallback', warning: err.message, hits };
    }
  }
}
