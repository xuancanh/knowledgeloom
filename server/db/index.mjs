import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { appDbPath, knowledgeDir, READ_ONLY_MODE, remindersDbPath } from '../lib/config.mjs';
import * as schema from './schema.mjs';

let _db = null;

/**
 * Returns the process-wide Drizzle ORM instance backed by better-sqlite3.
 *
 * All SQLite operations are synchronous. The service layer still exposes async
 * functions because filesystem, Meilisearch, and Codex work surrounds these
 * synchronous calls.
 */
export function getDb() {
  if (!_db) throw new Error('Database not initialised. Call initDb() first.');
  return _db;
}

/**
 * Opens the application SQLite database, runs DDL to create tables, and
 * migrates any existing reminders from the old reminders.sqlite sidecar file.
 *
 * Idempotent: safe to call multiple times; CREATE TABLE IF NOT EXISTS and the
 * empty-table guard prevent duplicate work.
 */
export async function initDb() {
  if (READ_ONLY_MODE) return;
  await mkdir(knowledgeDir, { recursive: true });

  const sqlite = new Database(appDbPath);

  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS jobs (
      id         TEXT    PRIMARY KEY,
      status     TEXT    NOT NULL,
      mode       TEXT    NOT NULL,
      topic      TEXT    NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      maxAttempts INTEGER NOT NULL DEFAULT 0,
      createdAt  TEXT    NOT NULL,
      startedAt  TEXT,
      finishedAt TEXT,
      nextRunAt  TEXT,
      error      TEXT,
      payload    TEXT    NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status_next_run ON jobs(status, nextRunAt);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at      ON jobs(createdAt);

    CREATE TABLE IF NOT EXISTS reminders (
      id          TEXT PRIMARY KEY,
      noteId      TEXT NOT NULL,
      remindAt    TEXT NOT NULL,
      message     TEXT NOT NULL DEFAULT '',
      createdAt   TEXT NOT NULL,
      completedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_note_id      ON reminders(noteId);
    CREATE INDEX IF NOT EXISTS idx_reminders_remind_at    ON reminders(remindAt);
    CREATE INDEX IF NOT EXISTS idx_reminders_completed_at ON reminders(completedAt);

    CREATE TABLE IF NOT EXISTS flashcard_cache (
      noteId      TEXT PRIMARY KEY,
      hash        TEXT NOT NULL,
      cards       TEXT NOT NULL,
      generatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flashcard_cache_hash ON flashcard_cache(hash);
  `);

  _db = drizzle(sqlite, { schema });

  // One-time migration: import reminders from the old reminders.sqlite sidecar
  // if the new consolidated reminders table is empty and the old file exists.
  await _migrateReminders(sqlite);
}

/**
 * Imports rows from reminders.sqlite into app.sqlite once, then leaves the old
 * file in place as a reference artifact.
 */
async function _migrateReminders(sqlite) {
  if (!existsSync(remindersDbPath)) return;

  const count = sqlite.prepare('SELECT COUNT(*) AS n FROM reminders').get();
  if (count.n > 0) return;

  let legacy;
  try {
    legacy = new Database(remindersDbPath, { readonly: true });
  } catch {
    return;
  }

  let rows;
  try {
    rows = legacy.prepare('SELECT * FROM reminders').all();
  } catch {
    legacy.close();
    return;
  }
  legacy.close();

  if (!rows.length) return;

  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO reminders (id, noteId, remindAt, message, createdAt, completedAt)
    VALUES (@id, @noteId, @remindAt, @message, @createdAt, @completedAt)
  `);

  const tx = sqlite.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  tx(rows);
  console.log(`Migrated ${rows.length} reminder(s) from reminders.sqlite into app.sqlite`);
}
