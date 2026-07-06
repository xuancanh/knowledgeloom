/**
 * Append-only log of every flashcard/quiz rating. Written by the review
 * endpoints; read by the retention analytics (GET /api/study/stats).
 * Recording never throws — analytics must not break reviewing.
 */
import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, gte } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, REVIEW_EVENTS_TABLE } from '../database/database.constants';

export interface ReviewEvent {
  itemId: string;
  itemType: 'flashcard' | 'quiz';
  noteId: string;
  rating: string;
  grade: number;
  elapsedDays: number;
  stability: number | null;
  reviewedAt: string;
}

@Injectable()
export class ReviewEventsRepository {
  private readonly logger = new Logger(ReviewEventsRepository.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(REVIEW_EVENTS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async record(userId: string, event: ReviewEvent): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    try {
      const dialect = this.config.get<string>('databaseDialect') || 'sqlite';
      const values = {
        userId,
        itemId: event.itemId,
        itemType: event.itemType,
        noteId: event.noteId,
        rating: event.rating,
        grade: event.grade,
        elapsedDays: event.elapsedDays.toFixed(3),
        stability: event.stability != null ? event.stability.toFixed(4) : null,
        reviewedAt: event.reviewedAt,
      };
      if (dialect === 'postgres') await this.db.insert(this.table).values(values);
      else this.db.insert(this.table).values(values).run();
    } catch (err) {
      this.logger.warn(`review event not recorded: ${(err as Error).message}`);
    }
  }

  /** All events for a user since the given ISO timestamp. */
  async since(userId: string, sinceIso: string): Promise<ReviewEvent[]> {
    if (this.config.get<boolean>('readOnly') || !this.db) return [];
    const rows = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.userId, userId), gte(this.table.reviewedAt, sinceIso)));
    return rows.map((r: any) => ({
      itemId: r.itemId,
      itemType: r.itemType,
      noteId: r.noteId,
      rating: r.rating,
      grade: r.grade,
      elapsedDays: parseFloat(r.elapsedDays || '0'),
      stability: r.stability != null ? parseFloat(r.stability) : null,
      reviewedAt: r.reviewedAt,
    }));
  }
}
