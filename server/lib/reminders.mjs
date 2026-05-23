import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { knowledgeDir, remindersDbPath, READ_ONLY_MODE } from './config.mjs';

let db = null;

/**
 * Opens the SQLite reminder database once per process.
 *
 * The database lives inside `knowledge/` because reminders are local app data,
 * not derived note artifacts. This keeps reminder state durable across backend
 * restarts without mixing it into markdown frontmatter.
 */
function database() {
  if (db) return db;
  db = new DatabaseSync(remindersDbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}

/**
 * Creates the reminder table and indexes.
 *
 * Reminders are intentionally simple: one note id, one scheduled time, optional
 * message, and a completed timestamp. "Due" reminders are computed from
 * `remindAt <= now` and `completedAt IS NULL`.
 */
export async function ensureReminderStore() {
  if (READ_ONLY_MODE) return;
  await mkdir(knowledgeDir, { recursive: true });
  database().exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      noteId TEXT NOT NULL,
      remindAt TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL,
      completedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_note_id ON reminders(noteId);
    CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remindAt);
    CREATE INDEX IF NOT EXISTS idx_reminders_completed_at ON reminders(completedAt);
  `);
}

/**
 * Converts a SQLite row into the API shape consumed by the frontend.
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
 * Parses and validates a future reminder time. Reminder scheduling is stored
 * as ISO UTC so the API has one canonical time format, while the frontend can
 * still collect dates through a local `datetime-local` field.
 */
function normalizeRemindAt(value) {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.getTime())) {
    const error = new Error('valid remindAt is required');
    error.status = 400;
    throw error;
  }
  if (parsed.getTime() <= Date.now()) {
    const error = new Error('remindAt must be in the future');
    error.status = 400;
    throw error;
  }
  return parsed.toISOString();
}

/**
 * Lists reminders with optional note/status filters.
 */
export function listReminders({ noteId, status } = {}) {
  if (READ_ONLY_MODE) return [];
  const conditions = [];
  const params = {};
  if (noteId) {
    conditions.push('noteId = $noteId');
    params.$noteId = String(noteId);
  }
  if (status === 'active') conditions.push('completedAt IS NULL');
  if (status === 'done') conditions.push('completedAt IS NOT NULL');
  if (status === 'due') {
    conditions.push('completedAt IS NULL');
    conditions.push('remindAt <= $now');
    params.$now = new Date().toISOString();
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return database()
    .prepare(`SELECT * FROM reminders ${where} ORDER BY completedAt IS NOT NULL, remindAt ASC`)
    .all(params)
    .map(serialize);
}

/**
 * Schedules a reminder for one article.
 */
export function createReminder({ noteId, remindAt, message }) {
  assertWritable();
  const cleanNoteId = path.basename(String(noteId || '').trim());
  if (!cleanNoteId) {
    const error = new Error('noteId is required');
    error.status = 400;
    throw error;
  }
  const now = new Date().toISOString();
  const reminder = {
    id: randomUUID(),
    noteId: cleanNoteId,
    remindAt: normalizeRemindAt(remindAt),
    message: String(message || '').trim(),
    createdAt: now,
    completedAt: null,
  };
  database().prepare(`
    INSERT INTO reminders (id, noteId, remindAt, message, createdAt, completedAt)
    VALUES ($id, $noteId, $remindAt, $message, $createdAt, $completedAt)
  `).run({
    $id: reminder.id,
    $noteId: reminder.noteId,
    $remindAt: reminder.remindAt,
    $message: reminder.message,
    $createdAt: reminder.createdAt,
    $completedAt: reminder.completedAt,
  });
  return reminder;
}

/**
 * Marks a reminder complete or active again.
 */
export function updateReminder(id, updates) {
  assertWritable();
  const reminder = getReminder(id);
  if (!reminder) {
    const error = new Error('reminder not found');
    error.status = 404;
    throw error;
  }
  const completedAt = updates.completed === true
    ? new Date().toISOString()
    : updates.completed === false
      ? null
      : reminder.completedAt;
  const remindAt = updates.remindAt ? normalizeRemindAt(updates.remindAt) : reminder.remindAt;
  const message = updates.message === undefined ? reminder.message : String(updates.message || '').trim();
  database().prepare(`
    UPDATE reminders
    SET remindAt = $remindAt, message = $message, completedAt = $completedAt
    WHERE id = $id
  `).run({ $id: id, $remindAt: remindAt, $message: message, $completedAt: completedAt });
  return getReminder(id);
}

/**
 * Removes a reminder permanently.
 */
export function deleteReminder(id) {
  assertWritable();
  const result = database().prepare('DELETE FROM reminders WHERE id = $id').run({ $id: String(id) });
  if (!result.changes) {
    const error = new Error('reminder not found');
    error.status = 404;
    throw error;
  }
  return { deleted: String(id) };
}

/**
 * Deletes all reminders for a note that is being removed.
 */
export function deleteRemindersForNote(noteId) {
  if (READ_ONLY_MODE) return { deleted: 0 };
  const result = database().prepare('DELETE FROM reminders WHERE noteId = $noteId').run({ $noteId: String(noteId) });
  return { deleted: result.changes || 0 };
}

function getReminder(id) {
  const row = database().prepare('SELECT * FROM reminders WHERE id = $id').get({ $id: String(id) });
  return row ? serialize(row) : null;
}

function assertWritable() {
  if (!READ_ONLY_MODE) return;
  const error = new Error('service is running in read-only mode');
  error.status = 403;
  throw error;
}
