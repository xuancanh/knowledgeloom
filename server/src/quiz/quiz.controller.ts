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
