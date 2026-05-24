import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { UserFlashcardsRepository } from './user-flashcards.repository';
import { HiddenFlashcardsRepository } from './hidden-flashcards.repository';
import { FlashcardReviewsRepository } from './flashcard-reviews.repository';

@Controller('api/flashcards')
export class FlashcardsController {
  constructor(
    private readonly flashcardsService: FlashcardsService,
    private readonly userFlashcardsRepo: UserFlashcardsRepository,
    private readonly hiddenFlashcardsRepo: HiddenFlashcardsRepository,
    private readonly reviewsRepo: FlashcardReviewsRepository,
  ) {}

  @Post()
  async create(@Body() body: { noteId: string; prompt: string; lesson: string; kind: string }) {
    const card = await this.userFlashcardsRepo.create(body);
    return { flashcard: card };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { prompt: string; lesson: string; kind: string },
  ) {
    await this.userFlashcardsRepo.update(id, body);
    return { updated: id };
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.hiddenFlashcardsRepo.hide(id);
    await this.reviewsRepo.delete(id);
    await this.userFlashcardsRepo.delete(id);
  }

  @Post(':id/review')
  @HttpCode(200)
  async review(
    @Param('id') cardId: string,
    @Body() body: { rating: 'again' | 'hard' | 'good'; noteId: string; isUserCard?: boolean },
  ) {
    const review = this.flashcardsService.computeReview(body.rating);
    await this.reviewsRepo.upsert({
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
