/**
 * Spaced-repetition review records for flashcards (SM-2 algorithm).
 * Tracks easeFactor, interval, repetitions, and last rating per user per card.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
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
  /** FSRS memory state; null on legacy rows until their next review. */
  stability: number | null;
  difficulty: number | null;
  lapses: number;
}

@Injectable()
export class FlashcardReviewsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(FLASHCARD_REVIEWS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async loadAll(userId: string): Promise<Map<string, FlashcardReview>> {
    if (this.config.get<boolean>('readOnly') || !this.db) return new Map();
    const rows = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.userId, userId));
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
        stability: row.stability != null ? parseFloat(row.stability) : null,
        difficulty: row.difficulty != null ? parseFloat(row.difficulty) : null,
        lapses: row.lapses ?? 0,
      });
    }
    return map;
  }

  async find(userId: string, cardId: string): Promise<FlashcardReview | null> {
    if (this.config.get<boolean>('readOnly') || !this.db) return null;
    const row = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.cardId, cardId)))
      .get();
    if (!row) return null;
    return {
      cardId: row.cardId,
      noteId: row.noteId,
      isUserCard: row.isUserCard === 1 || row.isUserCard === true,
      easeFactor: row.easeFactor,
      interval: row.interval,
      repetitions: row.repetitions,
      nextReviewAt: row.nextReviewAt ?? null,
      lastReviewAt: row.lastReviewAt ?? null,
      lastRating: row.lastRating ?? null,
      stability: row.stability != null ? parseFloat(row.stability) : null,
      difficulty: row.difficulty != null ? parseFloat(row.difficulty) : null,
      lapses: row.lapses ?? 0,
    };
  }

  async upsert(userId: string, review: {
    cardId: string;
    noteId: string;
    isUserCard: boolean;
    easeFactor: string;
    interval: number;
    repetitions: number;
    nextReviewAt: string | null;
    lastReviewAt: string;
    lastRating: string;
    stability?: number | null;
    difficulty?: number | null;
    lapses?: number;
  }): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    const fsrsFields = {
      stability: review.stability != null ? review.stability.toFixed(4) : null,
      difficulty: review.difficulty != null ? review.difficulty.toFixed(4) : null,
      lapses: review.lapses ?? 0,
    };
    const existing = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.cardId, review.cardId)))
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
          ...fsrsFields,
        })
        .where(and(eq(this.table.userId, userId), eq(this.table.cardId, review.cardId)))
        .run();
    } else {
      await this.db
        .insert(this.table)
        .values({
          cardId: review.cardId,
          userId,
          noteId: review.noteId,
          isUserCard: review.isUserCard ? 1 : 0,
          easeFactor: review.easeFactor,
          interval: review.interval,
          repetitions: review.repetitions,
          nextReviewAt: review.nextReviewAt,
          lastReviewAt: review.lastReviewAt,
          lastRating: review.lastRating,
          ...fsrsFields,
        })
        .run();
    }
  }

  async delete(userId: string, cardId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await this.db
      .delete(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.cardId, cardId)))
      .run();
  }
}
