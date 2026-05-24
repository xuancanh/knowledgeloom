/**
 * One-time migration: copy legacy single-user data into knowledge/users/local/
 *
 * What it does:
 *   1. Copies markdown notes from knowledge/notes/ → knowledge/users/local/notes/
 *      (skips any file already present in the destination)
 *   2. Updates all DB rows with userId='' to userId='local'
 *   3. Records the migration in __migrations so it won't re-run on server start
 *
 * Safe to run multiple times — every step checks before acting.
 * Does NOT delete the source files (non-destructive).
 */

import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DB_PATH = join(ROOT, 'knowledge', 'app.sqlite');
const SRC_NOTES = join(ROOT, 'knowledge', 'notes');
const DST_NOTES = join(ROOT, 'knowledge', 'users', 'local', 'notes');

// ── 1. File migration ──────────────────────────────────────────────────────

function countFiles(dir) {
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) n += countFiles(join(dir, entry.name));
    else n += 1;
  }
  return n;
}

const srcCount = countFiles(SRC_NOTES);

if (srcCount === 0) {
  console.log('No notes found in knowledge/notes/ — skipping file migration.');
} else {
  const dstCount = countFiles(DST_NOTES);
  if (dstCount >= srcCount) {
    console.log(`File migration already done (${dstCount} files in users/local/notes/).`);
  } else {
    mkdirSync(DST_NOTES, { recursive: true });
    cpSync(SRC_NOTES, DST_NOTES, {
      recursive: true,
      // Don't overwrite files already migrated
      force: false,
      errorOnExist: false,
    });
    console.log(`Copied ${srcCount} note file(s) → knowledge/users/local/notes/`);
  }
}

// ── 2. DB migration ────────────────────────────────────────────────────────

if (!existsSync(DB_PATH)) {
  console.log('No app.sqlite found — skipping DB migration.');
  process.exit(0);
}

const db = new Database(DB_PATH);

// Ensure migrations table exists (created by server migrator, but run script
// could be called before the server has ever started).
db.exec(`CREATE TABLE IF NOT EXISTS __migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`);

const MIGRATION_ID = '0002_assign_local_userid';
const already = db.prepare('SELECT id FROM __migrations WHERE id = ?').get(MIGRATION_ID);

if (already) {
  console.log('DB migration already applied — nothing to do.');
  db.close();
  process.exit(0);
}

const TABLES = [
  'jobs',
  'reminders',
  'flashcard_cache',
  'flashcard_reviews',
  'user_flashcards',
  'hidden_flashcards',
];

db.transaction(() => {
  let total = 0;
  for (const table of TABLES) {
    // Check the table actually has a userId column before touching it.
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(r => r.name);
    if (!cols.includes('userId')) {
      console.warn(`  ${table}: no userId column — skipped (run server once to apply schema migrations first)`);
      continue;
    }
    const { changes } = db.prepare(`UPDATE ${table} SET userId = 'local' WHERE userId = ''`).run();
    if (changes > 0) console.log(`  ${table}: ${changes} row(s) → userId='local'`);
    total += changes;
  }
  db.prepare('INSERT INTO __migrations (id, applied_at) VALUES (?, ?)').run(
    MIGRATION_ID,
    new Date().toISOString(),
  );
  console.log(`DB migration complete — ${total} row(s) updated.`);
})();

db.close();
