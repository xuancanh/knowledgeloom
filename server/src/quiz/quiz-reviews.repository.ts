import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, QUIZ_REVIEWS_TABLE } from '../database/database.constants';

export interface QuizReview {
  questionId: string;
  noteId: string;
  nextReviewAt: string | null;
  lastReviewAt: string | null;
  lastRating: 'correct' | 'wrong' | null;
  streak: number;
}

@Injectable()
export class QuizReviewsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(QUIZ_REVIEWS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async loadAll(userId: string): Promise<Map<string, QuizReview>> {
    if (this.config.get<boolean>('readOnly') || !this.db) return new Map();
    const rows = await this.db.select().from(this.table).where(eq(this.table.userId, userId));
    return new Map(rows.map((r: any) => [r.questionId, {
      questionId: r.questionId,
      noteId: r.noteId,
      nextReviewAt: r.nextReviewAt ?? null,
      lastReviewAt: r.lastReviewAt ?? null,
      lastRating: (r.lastRating as 'correct' | 'wrong' | null) ?? null,
      streak: r.streak ?? 0,
    }]));
  }

  async upsert(userId: string, review: QuizReview): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    const dialect = this.config.get<string>('databaseDialect') || 'sqlite';
    const values = {
      questionId: review.questionId,
      userId,
      noteId: review.noteId,
      nextReviewAt: review.nextReviewAt,
      lastReviewAt: review.lastReviewAt,
      lastRating: review.lastRating,
      streak: review.streak,
    };
    if (dialect === 'postgres') {
      await this.db.insert(this.table).values(values).onConflictDoUpdate({
        target: this.table.questionId,
        set: { nextReviewAt: values.nextReviewAt, lastReviewAt: values.lastReviewAt, lastRating: values.lastRating, streak: values.streak },
      });
    } else {
      this.db.insert(this.table).values(values).onConflictDoUpdate({
        target: this.table.questionId,
        set: { nextReviewAt: values.nextReviewAt, lastReviewAt: values.lastReviewAt, lastRating: values.lastRating, streak: values.streak },
      }).run();
    }
  }

  async delete(userId: string, questionId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    const dialect = this.config.get<string>('databaseDialect') || 'sqlite';
    const cond = and(eq(this.table.questionId, questionId), eq(this.table.userId, userId));
    if (dialect === 'postgres') {
      await this.db.delete(this.table).where(cond);
    } else {
      this.db.delete(this.table).where(cond).run();
    }
  }
}
