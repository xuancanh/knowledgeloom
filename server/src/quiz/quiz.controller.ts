/**
 * Quiz review, hide, and restore endpoints.
 * All routes require authentication.
 *
 *   POST   /api/quiz/:id/review   — rate a quiz question (correct/wrong)
 *   DELETE /api/quiz/:id          — hide a question from study
 *   POST   /api/quiz/:id/restore  — unhide a previously hidden question
 */
import { Controller, Post, Delete, Body, Param, HttpCode, UseGuards } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizReviewsRepository } from './quiz-reviews.repository';
import { QuizHiddenRepository } from './quiz-hidden.repository';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/quiz')
@UseGuards(ApiAuthGuard)
export class QuizController {
  constructor(
    private readonly quizService: QuizService,
    private readonly reviewsRepo: QuizReviewsRepository,
    private readonly hiddenRepo: QuizHiddenRepository,
  ) {}

  @Post(':id/review')
  @HttpCode(200)
  async review(
    @CurrentUser() userId: string,
    @Param('id') questionId: string,
    @Body() body: { rating: 'correct' | 'wrong'; noteId: string; currentStreak?: number },
  ) {
    const result = this.quizService.computeReview(body.rating, body.currentStreak ?? 0);
    await this.reviewsRepo.upsert(userId, {
      questionId,
      noteId: body.noteId,
      nextReviewAt: result.nextReviewAt,
      lastReviewAt: new Date().toISOString(),
      lastRating: body.rating,
      streak: result.streak,
    });
    return { review: result };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() userId: string, @Param('id') questionId: string) {
    await this.hiddenRepo.hide(userId, questionId);
    await this.reviewsRepo.delete(userId, questionId);
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@CurrentUser() userId: string, @Param('id') questionId: string) {
    await this.hiddenRepo.restore(userId, questionId);
    return { restored: questionId };
  }
}
