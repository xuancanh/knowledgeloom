import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, HIDDEN_FLASHCARDS_TABLE } from '../database/database.constants';

@Injectable()
export class HiddenFlashcardsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(HIDDEN_FLASHCARDS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async loadAll(): Promise<Set<string>> {
    if (this.config.get<boolean>('readOnly') || !this.db) return new Set();
    const rows = await this.db.select().from(this.table);
    return new Set(rows.map((r: any) => r.cardId));
  }

  async hide(cardId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await this.db
      .insert(this.table)
      .values({ cardId, createdAt: new Date().toISOString() })
      .onConflictDoNothing()
      .run();
  }

  async unhide(cardId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await this.db.delete(this.table).where(eq(this.table.cardId, cardId)).run();
  }
}
