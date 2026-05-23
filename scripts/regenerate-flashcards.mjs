import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { appDbPath, indexPath, notesDir } from '../server/lib/config.mjs';
import { syncFlashcards } from '../server/lib/flashcards.mjs';
import { parseNote, rebuildIndexes } from '../server/lib/notes.mjs';

async function listMarkdownFiles(dir = notesDir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listMarkdownFiles(absolute, relative));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(relative);
  }
  return files.sort();
}

const noteSources = [];
const files = await listMarkdownFiles();

for (const file of files) {
  const markdown = await readFile(path.join(notesDir, file), 'utf8');
  noteSources.push({ file, markdown, note: parseNote(file, markdown) });
}

const flashcards = await syncFlashcards(noteSources, { force: true });
const state = await rebuildIndexes();

// `rebuildIndexes` reloads the freshly generated cache. This write is only a
// guard for interrupted runs where the cache exists but the manifest did not
// get rewritten by a running server yet.
await writeFile(indexPath, JSON.stringify({ ...state, flashcards }, null, 2));

console.log(`Regenerated ${flashcards.length} AI flashcards for ${files.length} notes.`);
console.log(`Cache: ${appDbPath} (flashcard_cache table)`);
