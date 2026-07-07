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
import { fsrsReview, elapsedDaysBetween, type FsrsGrade } from '../scheduling/fsrs';
import { QuizReviewsRepository } from './quiz-reviews.repository';
import { QuizHiddenRepository } from './quiz-hidden.repository';
import { ReviewEventsRepository } from '../study/review-events.repository';
import { ApiAuthGuard } from '../auth/auth.guard';
import { WritableGuard } from '../common/guards/writable.guard';
import { CurrentScope } from '../auth/current-scope.decorator';

// All routes here mutate durable state (reviews, hide, restore), so the whole
// controller is gated on WritableGuard — read-only deployments reject writes
// with 403 instead of silently no-opping.
@Controller('api/quiz')
@UseGuards(ApiAuthGuard, WritableGuard)
export class QuizController {
  constructor(
    private readonly quizService: QuizService,
    private readonly reviewsRepo: QuizReviewsRepository,
    private readonly hiddenRepo: QuizHiddenRepository,
    private readonly eventsRepo: ReviewEventsRepository,
  ) {}

  @Post(':id/review')
  @HttpCode(200)
  async review(
    @CurrentScope() userId: string,
    @Param('id') questionId: string,
    @Body() body: { rating: 'correct' | 'wrong'; noteId: string; currentStreak?: number },
  ) {
    // FSRS scheduling (correct=3, wrong=1); streak stays as a UI counter.
    // Prior state comes from the DB, not the client — legacy rows (no FSRS
    // state yet) restart as new cards under FSRS but keep their streak.
    const existing = await this.reviewsRepo.find(userId, questionId);
    const priorState = existing?.stability != null && existing?.difficulty != null
      ? { stability: existing.stability, difficulty: existing.difficulty, reps: existing.streak + 1, lapses: existing.lapses ?? 0 }
      : null;
    const grade: FsrsGrade = body.rating === 'correct' ? 3 : 1;
    const outcome = fsrsReview(priorState, grade, elapsedDaysBetween(existing?.lastReviewAt));
    const streak = body.rating === 'correct' ? (existing?.streak ?? body.currentStreak ?? 0) + 1 : 0;

    const result = {
      nextReviewAt: outcome.nextReviewAt,
      streak,
      intervalDays: outcome.intervalDays,
      stability: Number(outcome.state.stability.toFixed(2)),
      difficulty: Number(outcome.state.difficulty.toFixed(2)),
      algorithm: 'fsrs-4.5',
    };
    await this.reviewsRepo.upsert(userId, {
      questionId,
      noteId: body.noteId,
      nextReviewAt: result.nextReviewAt,
      lastReviewAt: new Date().toISOString(),
      lastRating: body.rating,
      streak,
      stability: outcome.state.stability,
      difficulty: outcome.state.difficulty,
      lapses: outcome.state.lapses,
    });
    await this.eventsRepo.record(userId, {
      itemId: questionId,
      itemType: 'quiz',
      noteId: body.noteId || '',
      rating: body.rating,
      grade,
      elapsedDays: elapsedDaysBetween(existing?.lastReviewAt),
      stability: outcome.state.stability,
      reviewedAt: new Date().toISOString(),
    });
    return { review: result };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentScope() userId: string, @Param('id') questionId: string) {
    await this.hiddenRepo.hide(userId, questionId);
    await this.reviewsRepo.delete(userId, questionId);
  }

  @Post(':id/restore')
  @HttpCode(200)
  async restore(@CurrentScope() userId: string, @Param('id') questionId: string) {
    await this.hiddenRepo.restore(userId, questionId);
    return { restored: questionId };
  }
}
