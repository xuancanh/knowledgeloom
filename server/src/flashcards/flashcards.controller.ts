import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, UseGuards } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { UserFlashcardsRepository } from './user-flashcards.repository';
import { HiddenFlashcardsRepository } from './hidden-flashcards.repository';
import { FlashcardReviewsRepository } from './flashcard-reviews.repository';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/flashcards')
@UseGuards(SupabaseAuthGuard)
export class FlashcardsController {
  constructor(
    private readonly flashcardsService: FlashcardsService,
    private readonly userFlashcardsRepo: UserFlashcardsRepository,
    private readonly hiddenFlashcardsRepo: HiddenFlashcardsRepository,
    private readonly reviewsRepo: FlashcardReviewsRepository,
  ) {}

  @Post()
  async create(
    @CurrentUser() userId: string,
    @Body() body: { noteId: string; prompt: string; lesson: string; kind: string },
  ) {
    const card = await this.userFlashcardsRepo.create(userId, body);
    return { flashcard: card };
  }

  @Put(':id')
  async update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { prompt: string; lesson: string; kind: string },
  ) {
    await this.userFlashcardsRepo.update(userId, id, body);
    return { updated: id };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.hiddenFlashcardsRepo.hide(userId, id);
    await this.reviewsRepo.delete(userId, id);
    await this.userFlashcardsRepo.delete(userId, id);
  }

  @Post(':id/review')
  @HttpCode(200)
  async review(
    @CurrentUser() userId: string,
    @Param('id') cardId: string,
    @Body() body: { rating: 'again' | 'hard' | 'good'; noteId: string; isUserCard?: boolean },
  ) {
    const review = this.flashcardsService.computeReview(body.rating);
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
    });
    return { review };
  }
}
