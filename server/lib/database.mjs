import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { knowledgeDir, appDbPath, READ_ONLY_MODE } from './config.mjs';

let db = null;

/**
 * Opens the application SQLite database shared by durable backend repositories.
 *
 * This database stores operational state that should survive restarts but is
 * not part of the markdown note source: queued Codex work, AI flashcard cache,
 * and future app-owned tables. It intentionally does not store Meilisearch
 * documents because Meili is a search projection rebuilt from notes.
 */
export async function ensureApplicationDatabase() {
  if (READ_ONLY_MODE) return;
  await mkdir(knowledgeDir, { recursive: true });
  database().exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
  `);
}

/**
 * Returns the process-wide SQLite connection.
 *
 * `DatabaseSync` keeps repository code dependency-free and predictable for this
 * local-first backend. The service layer still exposes async functions because
 * it performs filesystem and Codex work around these synchronous transactions.
 */
export function database() {
  if (db) return db;
  db = new DatabaseSync(appDbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
}
