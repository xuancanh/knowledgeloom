import { Module } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { FlashcardCacheRepository } from './flashcard-cache.repository';
import { FlashcardReviewsRepository } from './flashcard-reviews.repository';
import { UserFlashcardsRepository } from './user-flashcards.repository';
import { HiddenFlashcardsRepository } from './hidden-flashcards.repository';
import { FlashcardsController } from './flashcards.controller';
import { AiModule } from '../ai/ai.module';
import { ReviewEventsModule } from '../study/review-events.module';

@Module({
  imports: [AiModule, ReviewEventsModule],
  controllers: [FlashcardsController],
  providers: [
    FlashcardsService,
    FlashcardCacheRepository,
    FlashcardReviewsRepository,
    UserFlashcardsRepository,
    HiddenFlashcardsRepository,
  ],
  exports: [FlashcardsService, UserFlashcardsRepository],
})
export class FlashcardsModule {}
