/**
 * Tracks which quiz questions the user has hidden from study.
 * Hidden questions are filtered out of the study set.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, QUIZ_HIDDEN_TABLE } from '../database/database.constants';

@Injectable()
export class QuizHiddenRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(QUIZ_HIDDEN_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async loadAll(userId: string): Promise<Set<string>> {
    if (this.config.get<boolean>('readOnly') || !this.db) return new Set();
    const rows = await this.db.select().from(this.table).where(eq(this.table.userId, userId));
    return new Set(rows.map((r: any) => r.questionId));
  }

  async hide(userId: string, questionId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    const dialect = this.config.get<string>('databaseDialect') || 'sqlite';
    const values = { questionId, userId, createdAt: new Date().toISOString() };
    if (dialect === 'postgres') {
      await this.db.insert(this.table).values(values).onConflictDoNothing();
    } else {
      this.db.insert(this.table).values(values).onConflictDoNothing().run();
    }
  }

  async restore(userId: string, questionId: string): Promise<void> {
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
