/**
 * ReviewEventsModule — standalone home for the review log repository so
 * FlashcardsModule, QuizModule, and StudyModule can all import it without
 * creating cycles (DatabaseModule is global, so no imports needed here).
 */
import { Module } from '@nestjs/common';
import { ReviewEventsRepository } from './review-events.repository';

@Module({
  providers: [ReviewEventsRepository],
  exports: [ReviewEventsRepository],
})
export class ReviewEventsModule {}
