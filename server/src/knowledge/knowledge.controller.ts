/**
 * KnowledgeController — serves the full knowledge graph snapshot.
 *
 * GET /api/knowledge is called on every page load to hydrate the frontend with
 * notes, categories, flashcards, and the link graph. It rebuilds derived state
 * from the markdown source so the frontend always reflects the latest disk
 * state even when notes are edited outside the app.
 */
import { Controller, Get } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

@Controller('api/knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  getKnowledge() {
    return this.knowledgeService.rebuildIndexes();
  }
}
