/**
 * Tracks which AI-generated flashcards the user has hidden.
 * Hidden cards are excluded from the study set.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, HIDDEN_FLASHCARDS_TABLE } from '../database/database.constants';
import { runWrite } from '../database/exec.util';

@Injectable()
export class HiddenFlashcardsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(HIDDEN_FLASHCARDS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async loadAll(userId: string): Promise<Set<string>> {
    if (this.config.get<boolean>('readOnly') || !this.db) return new Set();
    const rows = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.userId, userId));
    return new Set(rows.map((r: any) => r.cardId));
  }

  async hide(userId: string, cardId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await runWrite(this.db
      .insert(this.table)
      .values({ cardId, userId, createdAt: new Date().toISOString() })
      .onConflictDoNothing());
  }

  async unhide(userId: string, cardId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await runWrite(this.db
      .delete(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.cardId, cardId))));
  }
}
