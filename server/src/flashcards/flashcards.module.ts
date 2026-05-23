/**
 * FlashcardsModule — AI flashcard generation and caching.
 *
 * Imports AiModule to receive the configured AiProvider (Codex CLI or HTTP
 * API). The DATABASE module is @Global() so FlashcardCacheRepository can
 * receive DRIZZLE_DB without an explicit import here.
 */
import { Module } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { FlashcardCacheRepository } from './flashcard-cache.repository';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  providers: [FlashcardsService, FlashcardCacheRepository],
  exports: [FlashcardsService],
})
export class FlashcardsModule {}
