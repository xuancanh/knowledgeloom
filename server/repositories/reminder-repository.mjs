import { eq, asc, isNull, isNotNull, lte, and, sql } from 'drizzle-orm';
import { getDb } from '../db/index.mjs';
import { reminders as remindersTable } from '../db/schema.mjs';
import { READ_ONLY_MODE } from '../lib/config.mjs';

/**
 * Converts a Drizzle row into the API shape consumed by the frontend.
 */
function serialize(row) {
  return {
    id: row.id,
    noteId: row.noteId,
    remindAt: row.remindAt,
    message: row.message || '',
    createdAt: row.createdAt,
    completedAt: row.completedAt || null,
  };
}

/**
 * Lists reminders with optional note/status filters.
 *
 * @param {{ noteId?: string, status?: 'active'|'done'|'due' }} opts
 */
export function list({ noteId, status } = {}) {
  if (READ_ONLY_MODE) return [];
  const db = getDb();

  const conditions = [];
  if (noteId) conditions.push(eq(remindersTable.noteId, String(noteId)));
  if (status === 'active') conditions.push(isNull(remindersTable.completedAt));
  if (status === 'done') conditions.push(isNotNull(remindersTable.completedAt));
  if (status === 'due') {
    conditions.push(isNull(remindersTable.completedAt));
    conditions.push(lte(remindersTable.remindAt, new Date().toISOString()));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  // Order: incomplete first (completedAt IS NULL), then by remindAt ASC.
  const rows = where
    ? db.select().from(remindersTable).where(where).all()
    : db.select().from(remindersTable).all();

  return rows
    .sort((a, b) => {
      const aNull = a.completedAt === null || a.completedAt === undefined ? 0 : 1;
      const bNull = b.completedAt === null || b.completedAt === undefined ? 0 : 1;
      if (aNull !== bNull) return aNull - bNull;
      return (a.remindAt || '').localeCompare(b.remindAt || '');
    })
    .map(serialize);
}

/**
 * Fetches one reminder by id.
 */
export function findById(id) {
  if (READ_ONLY_MODE) return null;
  const row = getDb()
    .select()
    .from(remindersTable)
    .where(eq(remindersTable.id, String(id)))
    .get();
  return row ? serialize(row) : null;
}

/**
 * Inserts a new reminder.
 */
export function insert(reminder) {
  if (READ_ONLY_MODE) return;
  getDb().insert(remindersTable).values({
    id: reminder.id,
    noteId: reminder.noteId,
    remindAt: reminder.remindAt,
    message: reminder.message || '',
    createdAt: reminder.createdAt,
    completedAt: reminder.completedAt || null,
  }).run();
}

/**
 * Updates mutable fields of an existing reminder.
 */
export function update(id, { remindAt, message, completedAt }) {
  if (READ_ONLY_MODE) return;
  getDb()
    .update(remindersTable)
    .set({ remindAt, message, completedAt })
    .where(eq(remindersTable.id, String(id)))
    .run();
}

/**
 * Deletes one reminder by id. Returns true if a row was removed.
 */
export function remove(id) {
  if (READ_ONLY_MODE) return false;
  const result = getDb()
    .delete(remindersTable)
    .where(eq(remindersTable.id, String(id)))
    .run();
  return result.changes > 0;
}

/**
 * Deletes all reminders for a note that is being removed.
 */
export function removeForNote(noteId) {
  if (READ_ONLY_MODE) return 0;
  const result = getDb()
    .delete(remindersTable)
    .where(eq(remindersTable.noteId, String(noteId)))
    .run();
  return result.changes || 0;
}
