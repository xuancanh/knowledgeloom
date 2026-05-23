/**
 * KnowledgeModule — owns the index-rebuild pipeline.
 *
 * Also declares SearchController here (rather than in SearchModule) because
 * SearchController injects KnowledgeService for its fallback search path.
 * Declaring it in a separate SearchModule would create a circular dependency:
 * SearchModule → KnowledgeModule → SearchModule. Keeping the controller in
 * KnowledgeModule breaks that cycle cleanly.
 *
 * Exports KnowledgeService so NotesModule, CodexModule, and JobsModule can call
 * rebuildIndexes() after mutations without importing the full dependency tree.
 */
import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { SearchController } from '../search/search.controller';
import { NotesFileModule } from '../notes/notes-file.module';
import { FlashcardsModule } from '../flashcards/flashcards.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [NotesFileModule, FlashcardsModule, SearchModule],
  controllers: [KnowledgeController, SearchController],
  providers: [KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
