import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, FLASHCARD_REVIEWS_TABLE } from '../database/database.constants';

export interface FlashcardReview {
  cardId: string;
  noteId: string;
  isUserCard: boolean;
  easeFactor: string;
  interval: number;
  repetitions: number;
  nextReviewAt: string | null;
  lastReviewAt: string | null;
  lastRating: string | null;
}

@Injectable()
export class FlashcardReviewsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(FLASHCARD_REVIEWS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async loadAll(): Promise<Map<string, FlashcardReview>> {
    if (this.config.get<boolean>('readOnly') || !this.db) return new Map();
    const rows = await this.db.select().from(this.table);
    const map = new Map<string, FlashcardReview>();
    for (const row of rows) {
      map.set(row.cardId, {
        cardId: row.cardId,
        noteId: row.noteId,
        isUserCard: row.isUserCard === 1 || row.isUserCard === true,
        easeFactor: row.easeFactor,
        interval: row.interval,
        repetitions: row.repetitions,
        nextReviewAt: row.nextReviewAt ?? null,
        lastReviewAt: row.lastReviewAt ?? null,
        lastRating: row.lastRating ?? null,
      });
    }
    return map;
  }

  async upsert(review: {
    cardId: string;
    noteId: string;
    isUserCard: boolean;
    easeFactor: string;
    interval: number;
    repetitions: number;
    nextReviewAt: string | null;
    lastReviewAt: string;
    lastRating: string;
  }): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    const existing = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.cardId, review.cardId))
      .get();
    if (existing) {
      await this.db
        .update(this.table)
        .set({
          easeFactor: review.easeFactor,
          interval: review.interval,
          repetitions: review.repetitions,
          nextReviewAt: review.nextReviewAt,
          lastReviewAt: review.lastReviewAt,
          lastRating: review.lastRating,
        })
        .where(eq(this.table.cardId, review.cardId))
        .run();
    } else {
      await this.db
        .insert(this.table)
        .values({
          cardId: review.cardId,
          noteId: review.noteId,
          isUserCard: review.isUserCard ? 1 : 0,
          easeFactor: review.easeFactor,
          interval: review.interval,
          repetitions: review.repetitions,
          nextReviewAt: review.nextReviewAt,
          lastReviewAt: review.lastReviewAt,
          lastRating: review.lastRating,
        })
        .run();
    }
  }

  async delete(cardId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await this.db.delete(this.table).where(eq(this.table.cardId, cardId)).run();
  }
}
