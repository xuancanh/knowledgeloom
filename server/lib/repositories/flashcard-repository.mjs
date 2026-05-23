import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { flashcardsPath, READ_ONLY_MODE } from '../config.mjs';
import { database } from '../database.mjs';

/**
 * Creates the AI flashcard cache table.
 *
 * Flashcards are cached per note hash so normal index rebuilds do not invoke
 * Codex unless the note content or filter metadata changed. The card array is
 * stored as JSON because the cache is replaced per note as one generated unit.
 */
export function ensureFlashcardRepository() {
  if (READ_ONLY_MODE) return;
  database().exec(`
    CREATE TABLE IF NOT EXISTS flashcard_cache (
      noteId TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      cards TEXT NOT NULL,
      generatedAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_flashcard_cache_hash ON flashcard_cache(hash);
  `);
}

/**
 * Imports the previous JSON flashcard cache into SQLite once during upgrade.
 */
export async function importLegacyFlashcardsIfEmpty() {
  if (READ_ONLY_MODE || !existsSync(flashcardsPath)) return;
  ensureFlashcardRepository();
  const existing = database().prepare('SELECT COUNT(*) AS count FROM flashcard_cache').get();
  if (existing.count > 0) return;

  let raw;
  try {
    raw = JSON.parse(await readFile(flashcardsPath, 'utf8'));
  } catch {
    return;
  }

  const insert = database().prepare(`
    INSERT OR REPLACE INTO flashcard_cache (noteId, hash, cards, generatedAt)
    VALUES ($noteId, $hash, $cards, $generatedAt)
  `);
  database().exec('BEGIN');
  try {
    for (const [noteId, entry] of Object.entries(raw.notes || {})) {
      insert.run({
        $noteId: noteId,
        $hash: String(entry.hash || ''),
        $cards: JSON.stringify(entry.cards || []),
        $generatedAt: entry.generatedAt || raw.updatedAt || new Date().toISOString(),
      });
    }
    database().exec('COMMIT');
  } catch (error) {
    database().exec('ROLLBACK');
    throw error;
  }
}

/**
 * Loads all cached cards keyed by note id.
 */
export function loadFlashcardCache() {
  if (READ_ONLY_MODE) return {};
  ensureFlashcardRepository();
  const entries = {};
  for (const row of database().prepare('SELECT * FROM flashcard_cache').all()) {
    entries[row.noteId] = {
      hash: row.hash,
      cards: JSON.parse(row.cards),
      generatedAt: row.generatedAt,
    };
  }
  return entries;
}

/**
 * Replaces cache rows with the current note set.
 *
 * Deleting rows missing from `nextNotes` prevents flashcards for deleted notes
 * from surviving as stale review material.
 */
export function replaceFlashcardCache(nextNotes) {
  if (READ_ONLY_MODE) return;
  ensureFlashcardRepository();
  const insert = database().prepare(`
    INSERT OR REPLACE INTO flashcard_cache (noteId, hash, cards, generatedAt)
    VALUES ($noteId, $hash, $cards, $generatedAt)
  `);
  database().exec('BEGIN');
  try {
    database().prepare('DELETE FROM flashcard_cache').run();
    for (const [noteId, entry] of Object.entries(nextNotes)) {
      insert.run({
        $noteId: noteId,
        $hash: entry.hash,
        $cards: JSON.stringify(entry.cards || []),
        $generatedAt: entry.generatedAt || new Date().toISOString(),
      });
    }
    database().exec('COMMIT');
  } catch (error) {
    database().exec('ROLLBACK');
    throw error;
  }
}
