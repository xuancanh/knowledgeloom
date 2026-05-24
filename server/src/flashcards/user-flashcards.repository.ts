import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, USER_FLASHCARDS_TABLE } from '../database/database.constants';

export interface UserFlashcardRow {
  id: string;
  noteId: string;
  prompt: string;
  lesson: string;
  kind: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class UserFlashcardsRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(USER_FLASHCARDS_TABLE) private readonly table: any,
    private readonly config: ConfigService,
  ) {}

  async loadAll(): Promise<UserFlashcardRow[]> {
    if (this.config.get<boolean>('readOnly') || !this.db) return [];
    return this.db.select().from(this.table);
  }

  async create(data: {
    noteId: string;
    prompt: string;
    lesson: string;
    kind: string;
  }): Promise<UserFlashcardRow> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const row: UserFlashcardRow = {
      id,
      noteId: data.noteId,
      prompt: data.prompt,
      lesson: data.lesson,
      kind: data.kind,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(this.table).values(row).run();
    return row;
  }

  async update(id: string, data: { prompt: string; lesson: string; kind: string }): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await this.db
      .update(this.table)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(eq(this.table.id, id))
      .run();
  }

  async delete(id: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await this.db.delete(this.table).where(eq(this.table.id, id)).run();
  }
}
