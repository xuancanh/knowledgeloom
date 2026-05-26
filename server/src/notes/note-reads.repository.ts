import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, NOTE_READS_TABLE } from '../database/database.constants';

@Injectable()
export class NoteReadsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(NOTE_READS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async markRead(userId: string, noteId: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    const now = new Date().toISOString();
    const existing = await this.db
      .select()
      .from(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.noteId, noteId)));

    if (existing.length > 0) {
      await this.db
        .update(this.table)
        .set({ readCount: existing[0].readCount + 1, lastReadAt: now })
        .where(and(eq(this.table.userId, userId), eq(this.table.noteId, noteId)))
        .run();
    } else {
      await this.db
        .insert(this.table)
        .values({ userId, noteId, readCount: 1, firstReadAt: now, lastReadAt: now })
        .onConflictDoNothing()
        .run();
    }
  }

  async getReadCounts(userId: string): Promise<Record<string, number>> {
    if (!this.db) return {};
    const rows = await this.db
      .select()
      .from(this.table)
      .where(eq(this.table.userId, userId));
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.noteId] = row.readCount;
    }
    return counts;
  }

  async getReadNoteIds(userId: string): Promise<string[]> {
    if (!this.db) return [];
    const rows = await this.db
      .select({ noteId: this.table.noteId })
      .from(this.table)
      .where(eq(this.table.userId, userId));
    return rows.map((r: any) => r.noteId);
  }
}
