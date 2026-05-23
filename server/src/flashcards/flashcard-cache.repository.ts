import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, FLASHCARD_CACHE_TABLE } from '../database/database.constants';

export interface FlashcardCacheEntry {
  hash: string;
  cards: any[];
  generatedAt: string;
}

@Injectable()
export class FlashcardCacheRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(FLASHCARD_CACHE_TABLE) private readonly flashcardCacheTable: any,
    private readonly config: ConfigService,
  ) {}

  async load(): Promise<Record<string, FlashcardCacheEntry>> {
    if (this.config.get<boolean>('readOnly') || !this.db) return {};
    const entries: Record<string, FlashcardCacheEntry> = {};
    const rows = await this.db.select().from(this.flashcardCacheTable);
    for (const row of rows) {
      entries[row.noteId] = {
        hash: row.hash,
        cards: JSON.parse(row.cards),
        generatedAt: row.generatedAt,
      };
    }
    return entries;
  }

  async replace(nextNotes: Record<string, FlashcardCacheEntry>): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    const dialect = this.config.get<string>('databaseDialect') || 'sqlite';

    if (dialect === 'postgres') {
      await this.db.transaction(async (tx: any) => {
        await tx.delete(this.flashcardCacheTable);
        for (const [noteId, entry] of Object.entries(nextNotes)) {
          await tx.insert(this.flashcardCacheTable).values({
            noteId,
            hash: entry.hash,
            cards: JSON.stringify(entry.cards || []),
            generatedAt: entry.generatedAt || new Date().toISOString(),
          });
        }
      });
    } else {
      this.db.transaction((tx: any) => {
        tx.delete(this.flashcardCacheTable).run();
        for (const [noteId, entry] of Object.entries(nextNotes)) {
          tx.insert(this.flashcardCacheTable).values({
            noteId,
            hash: entry.hash,
            cards: JSON.stringify(entry.cards || []),
            generatedAt: entry.generatedAt || new Date().toISOString(),
          }).run();
        }
      });
    }
  }
}
