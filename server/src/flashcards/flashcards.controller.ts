/**
 * User-facing flashcard CRUD and spaced-repetition review endpoints.
 * All routes require authentication.
 *
 *   POST   /api/flashcards/:id/review  — rate a flashcard (again/hard/good)
 *   POST   /api/flashcards             — create a user-authored flashcard
 *   PUT    /api/flashcards/:id         — update a user-authored flashcard
 *   DELETE /api/flashcards/:id         — hide + delete a flashcard
 */
import { Controller, Post, Put, Delete, Body, Param, HttpCode, UseGuards } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { fsrsReview, seedFromLegacy, elapsedDaysBetween, type FsrsGrade } from '../scheduling/fsrs';
import { UserFlashcardsRepository } from './user-flashcards.repository';
import { HiddenFlashcardsRepository } from './hidden-flashcards.repository';
import { FlashcardReviewsRepository } from './flashcard-reviews.repository';
import { ReviewEventsRepository } from '../study/review-events.repository';
import { ApiAuthGuard } from '../auth/auth.guard';
import { WritableGuard } from '../common/guards/writable.guard';
import { CurrentScope } from '../auth/current-scope.decorator';
import { CreateFlashcardDto, UpdateFlashcardDto, ReviewFlashcardDto } from './flashcards.dto';

// Every route here mutates durable state, so the whole controller is gated on
// WritableGuard — read-only deployments reject writes with 403 instead of
// silently no-opping when the DB handle is null.
@Controller('api/flashcards')
@UseGuards(ApiAuthGuard, WritableGuard)
export class FlashcardsController {
  constructor(
    private readonly flashcardsService: FlashcardsService,
    private readonly userFlashcardsRepo: UserFlashcardsRepository,
    private readonly hiddenFlashcardsRepo: HiddenFlashcardsRepository,
    private readonly reviewsRepo: FlashcardReviewsRepository,
    private readonly eventsRepo: ReviewEventsRepository,
  ) {}

  @Post()
  async create(
    @CurrentScope() userId: string,
    @Body() body: CreateFlashcardDto,
  ) {
    const card = await this.userFlashcardsRepo.create(userId, body as any);
    return { flashcard: card };
  }

  @Put(':id')
  async update(
    @CurrentScope() userId: string,
    @Param('id') id: string,
    @Body() body: UpdateFlashcardDto,
  ) {
    await this.userFlashcardsRepo.update(userId, id, body as any);
    return { updated: id };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentScope() userId: string, @Param('id') id: string) {
    await this.hiddenFlashcardsRepo.hide(userId, id);
    await this.reviewsRepo.delete(userId, id);
    await this.userFlashcardsRepo.delete(userId, id);
  }

  @Post(':id/review')
  @HttpCode(200)
  async review(
    @CurrentScope() userId: string,
    @Param('id') cardId: string,
    @Body() body: ReviewFlashcardDto,
  ) {
    // FSRS scheduling. Prior state is loaded server-side (the old code always
    // scheduled from scratch, so intervals never grew); legacy SM-2 rows are
    // seeded from their interval/ease on first FSRS review.
    const existing = await this.reviewsRepo.find(userId, cardId);
    const priorState = existing?.stability != null && existing?.difficulty != null
      ? { stability: existing.stability, difficulty: existing.difficulty, reps: existing.repetitions, lapses: existing.lapses }
      : existing
        ? seedFromLegacy(existing.interval, parseFloat(existing.easeFactor), existing.repetitions)
        : null;

    const grade: FsrsGrade = body.rating === 'again' ? 1 : body.rating === 'hard' ? 2 : 3;
    const elapsed = elapsedDaysBetween(existing?.lastReviewAt);
    const outcome = fsrsReview(priorState, grade, elapsed);

    const review = {
      // legacy field names kept for the UI; easeFactor now carries difficulty
      easeFactor: outcome.state.difficulty.toFixed(2),
      interval: outcome.intervalDays,
      repetitions: outcome.state.reps,
      nextReviewAt: outcome.nextReviewAt,
      stability: Number(outcome.state.stability.toFixed(2)),
      difficulty: Number(outcome.state.difficulty.toFixed(2)),
      lapses: outcome.state.lapses,
      algorithm: 'fsrs-4.5',
    };
    await this.reviewsRepo.upsert(userId, {
      cardId,
      noteId: body.noteId,
      isUserCard: body.isUserCard ?? false,
      easeFactor: review.easeFactor,
      interval: review.interval,
      repetitions: review.repetitions,
      nextReviewAt: review.nextReviewAt,
      lastReviewAt: new Date().toISOString(),
      lastRating: body.rating,
      stability: outcome.state.stability,
      difficulty: outcome.state.difficulty,
      lapses: outcome.state.lapses,
    });
    await this.eventsRepo.record(userId, {
      itemId: cardId,
      itemType: 'flashcard',
      noteId: body.noteId || '',
      rating: body.rating,
      grade,
      elapsedDays: elapsed,
      stability: outcome.state.stability,
      reviewedAt: new Date().toISOString(),
    });
    return { review };
  }
}
