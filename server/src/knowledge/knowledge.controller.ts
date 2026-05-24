/**
 * KnowledgeController — serves the full knowledge graph snapshot.
 *
 * GET /api/knowledge is called on every page load to hydrate the frontend with
 * notes, categories, flashcards, and the link graph. It rebuilds derived state
 * from the markdown source so the frontend always reflects the latest disk
 * state even when notes are edited outside the app.
 *
 * Requires authentication — results are scoped to the authenticated user.
 */
import { Controller, Get, UseGuards } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/knowledge')
@UseGuards(SupabaseAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  getKnowledge(@CurrentUser() userId: string) {
    return this.knowledgeService.rebuildIndexes(userId);
  }
}
