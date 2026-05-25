import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, QUIZ_CACHE_TABLE } from '../database/database.constants';

export interface QuizCacheEntry {
  hash: string;
  questions: any[];
  generatedAt: string;
}

@Injectable()
export class QuizCacheRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(QUIZ_CACHE_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async load(userId: string): Promise<Record<string, QuizCacheEntry>> {
    if (this.config.get<boolean>('readOnly') || !this.db) return {};
    const entries: Record<string, QuizCacheEntry> = {};
    const rows = await this.db.select().from(this.table).where(eq(this.table.userId, userId));
    for (const row of rows) {
      entries[row.noteId] = {
        hash: row.hash,
        questions: JSON.parse(row.questions),
        generatedAt: row.generatedAt,
      };
    }
    return entries;
  }

  async replace(userId: string, nextNotes: Record<string, QuizCacheEntry>): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    const dialect = this.config.get<string>('databaseDialect') || 'sqlite';

    if (dialect === 'postgres') {
      await this.db.transaction(async (tx: any) => {
        await tx.delete(this.table).where(eq(this.table.userId, userId));
        for (const [noteId, entry] of Object.entries(nextNotes)) {
          await tx.insert(this.table).values({
            noteId, userId,
            hash: entry.hash,
            questions: JSON.stringify(entry.questions || []),
            generatedAt: entry.generatedAt || new Date().toISOString(),
          });
        }
      });
    } else {
      this.db.transaction((tx: any) => {
        tx.delete(this.table).where(eq(this.table.userId, userId)).run();
        for (const [noteId, entry] of Object.entries(nextNotes)) {
          tx.insert(this.table).values({
            noteId, userId,
            hash: entry.hash,
            questions: JSON.stringify(entry.questions || []),
            generatedAt: entry.generatedAt || new Date().toISOString(),
          }).run();
        }
      });
    }
  }
}
