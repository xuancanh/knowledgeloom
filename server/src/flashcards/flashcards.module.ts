import { Module } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { FlashcardCacheRepository } from './flashcard-cache.repository';
import { FlashcardReviewsRepository } from './flashcard-reviews.repository';
import { UserFlashcardsRepository } from './user-flashcards.repository';
import { HiddenFlashcardsRepository } from './hidden-flashcards.repository';
import { FlashcardsController } from './flashcards.controller';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [FlashcardsController],
  providers: [
    FlashcardsService,
    FlashcardCacheRepository,
    FlashcardReviewsRepository,
    UserFlashcardsRepository,
    HiddenFlashcardsRepository,
  ],
  exports: [FlashcardsService],
})
export class FlashcardsModule {}
