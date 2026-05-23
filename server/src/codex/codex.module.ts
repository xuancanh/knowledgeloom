/**
 * CodexModule — AI note creation and editing.
 *
 * Imports AiModule (which provides the configured AiProvider) instead of
 * CodexRunnerModule directly, so CodexService is isolated from the choice of
 * AI backend. Switching from the Codex CLI to OpenRouter only requires an
 * environment variable change — no module rewiring needed.
 *
 * Dependency chain (no circular imports):
 *   AiModule        → CodexRunnerModule → (none)
 *                    → OpenRouterAiProvider → (none)
 *   NotesFileModule → (none)
 *   KnowledgeModule → NotesFileModule, FlashcardsModule → AiModule, SearchModule
 *   CodexModule     → AiModule, NotesFileModule, KnowledgeModule
 */
import { Module } from '@nestjs/common';
import { CodexService } from './codex.service';
import { AiModule } from '../ai/ai.module';
import { NotesFileModule } from '../notes/notes-file.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [AiModule, NotesFileModule, KnowledgeModule],
  providers: [CodexService],
  exports: [CodexService],
})
export class CodexModule {}
