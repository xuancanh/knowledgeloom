/**
 * ReminderRepository — Drizzle ORM access layer for the reminders table.
 *
 * All methods are synchronous because better-sqlite3 is synchronous. The
 * service layer still exposes async signatures for uniformity with the rest of
 * the NestJS codebase.
 *
 * The reminders table is consolidated into app.sqlite (previously a separate
 * reminders.sqlite sidecar). DatabaseModule runs the one-time migration on
 * startup.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, isNull, isNotNull, lte, and } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB } from '../database/database.constants';
import { reminders as remindersTable } from '../database/schema';
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
    private readonly config: ConfigService,
  ) {}

  list({ noteId, status }: { noteId?: string; status?: string } = {}): Reminder[] {
    if (this.config.get<boolean>('readOnly') || !this.db) return [];

    const conditions: any[] = [];
    if (noteId) conditions.push(eq(remindersTable.noteId, String(noteId)));
    if (status === 'active') conditions.push(isNull(remindersTable.completedAt));
    if (status === 'done') conditions.push(isNotNull(remindersTable.completedAt));
    if (status === 'due') {
      conditions.push(isNull(remindersTable.completedAt));
      conditions.push(lte(remindersTable.remindAt, new Date().toISOString()));
    }

    const rows = conditions.length
      ? this.db.select().from(remindersTable).where(and(...conditions)).all()
      : this.db.select().from(remindersTable).all();

    return rows
      .sort((a, b) => {
        const aNull = a.completedAt === null || a.completedAt === undefined ? 0 : 1;
        const bNull = b.completedAt === null || b.completedAt === undefined ? 0 : 1;
        if (aNull !== bNull) return aNull - bNull;
        return (a.remindAt || '').localeCompare(b.remindAt || '');
      })
      .map(serialize);
  }

  findById(id: string): Reminder | null {
    if (!this.db) return null;
    const row = this.db.select().from(remindersTable).where(eq(remindersTable.id, String(id))).get();
    return row ? serialize(row) : null;
  }

  insert(reminder: Reminder): void {
    if (!this.db) return;
    this.db.insert(remindersTable).values({
      id: reminder.id,
      noteId: reminder.noteId,
      remindAt: reminder.remindAt,
      message: reminder.message || '',
      createdAt: reminder.createdAt,
      completedAt: reminder.completedAt || null,
    }).run();
  }

  update(id: string, fields: { remindAt: string; message: string; completedAt: string | null }): void {
    if (!this.db) return;
    this.db.update(remindersTable).set(fields).where(eq(remindersTable.id, String(id))).run();
  }

  remove(id: string): boolean {
    if (!this.db) return false;
    const result = this.db.delete(remindersTable).where(eq(remindersTable.id, String(id))).run();
    return result.changes > 0;
  }

  removeForNote(noteId: string): number {
    if (!this.db) return 0;
    const result = this.db.delete(remindersTable).where(eq(remindersTable.noteId, String(noteId))).run();
    return result.changes || 0;
  }
}
