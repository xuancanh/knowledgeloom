import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB } from '../database/database.constants';
import { flashcardCache } from '../database/schema';

export interface FlashcardCacheEntry {
  hash: string;
  cards: any[];
  generatedAt: string;
}

@Injectable()
export class FlashcardCacheRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
  ) {}

  load(): Record<string, FlashcardCacheEntry> {
    if (this.config.get<boolean>('readOnly') || !this.db) return {};
    const entries: Record<string, FlashcardCacheEntry> = {};
    for (const row of this.db.select().from(flashcardCache).all()) {
      entries[row.noteId] = {
        hash: row.hash,
        cards: JSON.parse(row.cards),
        generatedAt: row.generatedAt,
      };
    }
    return entries;
  }

  replace(nextNotes: Record<string, FlashcardCacheEntry>): void {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    this.db.transaction((tx) => {
      tx.delete(flashcardCache).run();
      for (const [noteId, entry] of Object.entries(nextNotes)) {
        tx.insert(flashcardCache).values({
          noteId,
          hash: entry.hash,
          cards: JSON.stringify(entry.cards || []),
          generatedAt: entry.generatedAt || new Date().toISOString(),
        }).run();
      }
    });
  }
}
