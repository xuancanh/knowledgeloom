import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { getDb } from '../db/index.mjs';
import { flashcardCache as flashcardCacheTable } from '../db/schema.mjs';
import { flashcardsPath, READ_ONLY_MODE } from '../lib/config.mjs';

/**
 * Loads all cached flashcard entries keyed by note id.
 *
 * Returns an object of the form:
 *   { [noteId]: { hash, cards: Card[], generatedAt } }
 */
export function loadCache() {
  if (READ_ONLY_MODE) return {};
  const entries = {};
  for (const row of getDb().select().from(flashcardCacheTable).all()) {
    entries[row.noteId] = {
      hash: row.hash,
      cards: JSON.parse(row.cards),
      generatedAt: row.generatedAt,
    };
  }
  return entries;
}

/**
 * Replaces the entire flashcard cache atomically.
 * Deleting rows for notes that no longer exist prevents stale review material.
 *
 * @param {Record<string, { hash: string, cards: any[], generatedAt: string }>} nextNotes
 */
export function replaceCache(nextNotes) {
  if (READ_ONLY_MODE) return;
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(flashcardCacheTable).run();
    for (const [noteId, entry] of Object.entries(nextNotes)) {
      tx.insert(flashcardCacheTable).values({
        noteId,
        hash: entry.hash,
        cards: JSON.stringify(entry.cards || []),
        generatedAt: entry.generatedAt || new Date().toISOString(),
      }).run();
    }
  });
}

/**
 * Imports the previous JSON flashcard cache into SQLite once during upgrade.
 */
export async function importLegacyIfEmpty() {
  if (READ_ONLY_MODE || !existsSync(flashcardsPath)) return;

  const db = getDb();
  const rows = db.select().from(flashcardCacheTable).all();
  if (rows.length > 0) return;

  let raw;
  try {
    raw = JSON.parse(await readFile(flashcardsPath, 'utf8'));
  } catch {
    return;
  }

  db.transaction((tx) => {
    for (const [noteId, entry] of Object.entries(raw.notes || {})) {
      tx.insert(flashcardCacheTable).values({
        noteId,
        hash: String(entry.hash || ''),
        cards: JSON.stringify(entry.cards || []),
        generatedAt: entry.generatedAt || raw.updatedAt || new Date().toISOString(),
      }).onConflictDoUpdate({
        target: flashcardCacheTable.noteId,
        set: { hash: String(entry.hash || ''), cards: JSON.stringify(entry.cards || []) },
      }).run();
    }
  });
}
