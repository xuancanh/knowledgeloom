import { Module } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizCacheRepository } from './quiz-cache.repository';
import { QuizReviewsRepository } from './quiz-reviews.repository';
import { QuizHiddenRepository } from './quiz-hidden.repository';
import { QuizController } from './quiz.controller';
import { AiModule } from '../ai/ai.module';
import { ReviewEventsModule } from '../study/review-events.module';

@Module({
  imports: [AiModule, ReviewEventsModule],
  controllers: [QuizController],
  providers: [
    QuizService,
    QuizCacheRepository,
    QuizReviewsRepository,
    QuizHiddenRepository,
  ],
  exports: [QuizService],
})
export class QuizModule {}
