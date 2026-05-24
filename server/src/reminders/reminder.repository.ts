/**
 * ReminderRepository — Drizzle ORM access layer for the reminders table.
 *
 * All methods are synchronous because better-sqlite3 is synchronous. The
 * service layer still exposes async signatures for uniformity with the rest of
 * the NestJS codebase.
 *
 * Every query filters by userId to ensure complete data isolation between users.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, isNull, isNotNull, lte, and } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, REMINDERS_TABLE } from '../database/database.constants';
import type { Reminder } from '../types';

function serialize(row: any): Reminder {
  return {
    id: row.id,
    noteId: row.noteId,
    remindAt: row.remindAt,
    message: row.message || '',
    createdAt: row.createdAt,
    completedAt: row.completedAt || null,
  };
}

@Injectable()
export class ReminderRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(REMINDERS_TABLE) private readonly remindersTable: any,
    private readonly config: ConfigService,
  ) {}

  async list(userId: string, { noteId, status }: { noteId?: string; status?: string } = {}): Promise<Reminder[]> {
    if (this.config.get<boolean>('readOnly') || !this.db) return [];

    const conditions: any[] = [eq(this.remindersTable.userId, userId)];
    if (noteId) conditions.push(eq(this.remindersTable.noteId, String(noteId)));
    if (status === 'active') conditions.push(isNull(this.remindersTable.completedAt));
    if (status === 'done') conditions.push(isNotNull(this.remindersTable.completedAt));
    if (status === 'due') {
      conditions.push(isNull(this.remindersTable.completedAt));
      conditions.push(lte(this.remindersTable.remindAt, new Date().toISOString()));
    }

    const rows = await this.db.select().from(this.remindersTable).where(and(...conditions));

    return rows
      .sort((a, b) => {
        const aNull = a.completedAt === null || a.completedAt === undefined ? 0 : 1;
        const bNull = b.completedAt === null || b.completedAt === undefined ? 0 : 1;
        if (aNull !== bNull) return aNull - bNull;
        return (a.remindAt || '').localeCompare(b.remindAt || '');
      })
      .map(serialize);
  }

  async findById(userId: string, id: string): Promise<Reminder | null> {
    if (!this.db) return null;
    const rows = await this.db
      .select()
      .from(this.remindersTable)
      .where(and(eq(this.remindersTable.userId, userId), eq(this.remindersTable.id, String(id))))
      .limit(1);
    const row = rows[0];
    return row ? serialize(row) : null;
  }

  async insert(userId: string, reminder: Reminder): Promise<void> {
    if (!this.db) return;
    await this.db.insert(this.remindersTable).values({
      id: reminder.id,
      userId,
      noteId: reminder.noteId,
      remindAt: reminder.remindAt,
      message: reminder.message || '',
      createdAt: reminder.createdAt,
      completedAt: reminder.completedAt || null,
    });
  }

  async update(userId: string, id: string, fields: { remindAt: string; message: string; completedAt: string | null }): Promise<void> {
    if (!this.db) return;
    await this.db
      .update(this.remindersTable)
      .set(fields)
      .where(and(eq(this.remindersTable.userId, userId), eq(this.remindersTable.id, String(id))));
  }

  async remove(userId: string, id: string): Promise<boolean> {
    if (!this.db) return false;
    const result = await this.db
      .delete(this.remindersTable)
      .where(and(eq(this.remindersTable.userId, userId), eq(this.remindersTable.id, String(id))))
      .returning();
    return result.length > 0;
  }

  async removeForNote(userId: string, noteId: string): Promise<number> {
    if (!this.db) return 0;
    const result = await this.db
      .delete(this.remindersTable)
      .where(and(eq(this.remindersTable.userId, userId), eq(this.remindersTable.noteId, String(noteId))))
      .returning();
    return result.length;
  }
}
