import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, USER_FLASHCARDS_TABLE } from '../database/database.constants';

export interface UserFlashcardRow {
  id: string;
  userId: string;
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

  async loadAll(userId: string): Promise<UserFlashcardRow[]> {
    if (this.config.get<boolean>('readOnly') || !this.db) return [];
    return this.db.select().from(this.table).where(eq(this.table.userId, userId));
  }

  async create(userId: string, data: {
    noteId: string;
    prompt: string;
    lesson: string;
    kind: string;
  }): Promise<UserFlashcardRow> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const row: UserFlashcardRow = {
      id,
      userId,
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

  async update(userId: string, id: string, data: { prompt: string; lesson: string; kind: string }): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await this.db
      .update(this.table)
      .set({ ...data, updatedAt: new Date().toISOString() })
      .where(and(eq(this.table.userId, userId), eq(this.table.id, id)))
      .run();
  }

  async delete(userId: string, id: string): Promise<void> {
    if (this.config.get<boolean>('readOnly') || !this.db) return;
    await this.db
      .delete(this.table)
      .where(and(eq(this.table.userId, userId), eq(this.table.id, id)))
      .run();
  }
}
