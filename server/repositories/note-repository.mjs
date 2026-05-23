import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { categoriesDir, indexPath, notesDir, READ_ONLY_MODE } from '../lib/config.mjs';
import { parseNote } from '../lib/note-parser.mjs';

/**
 * Ensures the local knowledge store exists before any route or job touches it.
 */
export async function ensureNoteStore() {
  if (READ_ONLY_MODE) return;
  await mkdir(notesDir, { recursive: true });
  await mkdir(categoriesDir, { recursive: true });
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, JSON.stringify({ notes: [], categories: [] }, null, 2));
  }
}

/**
 * Recursively lists markdown files below the notes root.
 */
export async function listNoteFiles(dir = notesDir, prefix = '') {
  await ensureNoteStore();
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listNoteFiles(absolute, relative));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(relative);
  }
  return files.sort();
}

/**
 * Finds the current markdown file for a note id regardless of category folder.
 */
export async function findNoteFileById(id) {
  const safeId = path.basename(id);
  const fileName = `${safeId}.md`;
  const files = await listNoteFiles();
  return files.find((file) => path.basename(file) === fileName) || null;
}

/**
 * Reads all markdown notes and returns parsed metadata sorted by filename.
 */
export async function readAllNotes() {
  await ensureNoteStore();
  const files = await listNoteFiles();
  const notes = [];
  for (const file of files) {
    const markdown = await readFile(path.join(notesDir, file), 'utf8');
    notes.push(parseNote(file, markdown));
  }
  return notes;
}

/**
 * Reads all note source objects: { file, markdown, note }.
 */
export async function readAllNoteSources() {
  await ensureNoteStore();
  const files = await listNoteFiles();
  const sources = [];
  for (const file of files) {
    const markdown = await readFile(path.join(notesDir, file), 'utf8');
    sources.push({ file, markdown, note: parseNote(file, markdown) });
  }
  return sources;
}

/**
 * Reads raw markdown for the editor/source drawer.
 */
export async function readMarkdown(id) {
  const file = await findNoteFileById(id);
  if (!file) {
    const error = new Error('note not found');
    error.status = 404;
    throw error;
  }
  return readFile(path.join(notesDir, file), 'utf8');
}

/**
 * Writes a note file at a path derived from slug + category.
 * Creates parent directories as needed.
 */
export async function writeNote(relativePath, markdown) {
  const fullPath = path.join(notesDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, markdown);
}

/**
 * Moves a note from one relative path to another, then removes the old file.
 */
export async function moveNote(fromRelative, toRelative, markdown) {
  const toPath = path.join(notesDir, toRelative);
  await mkdir(path.dirname(toPath), { recursive: true });
  if (existsSync(toPath)) {
    const error = new Error(`cannot move ${fromRelative}; ${toRelative} already exists`);
    error.status = 409;
    throw error;
  }
  await writeFile(toPath, markdown);
  await rm(path.join(notesDir, fromRelative), { force: true });
}

/**
 * Deletes a note file by its relative path.
 */
export async function deleteNoteFile(relativePath) {
  await rm(path.join(notesDir, relativePath), { force: true });
}

/**
 * Writes the category index markdown files (rebuilds all from scratch).
 */
export async function writeCategoryFiles(categories) {
  if (READ_ONLY_MODE) return;
  const staleCategoryFiles = (await readdir(categoriesDir)).filter((file) => file.endsWith('.md'));
  await Promise.all(staleCategoryFiles.map((file) => rm(path.join(categoriesDir, file), { force: true })));
  for (const category of categories) {
    const body = [
      `# ${category.name}`,
      '',
      `Summary: ${category.summaries.filter(Boolean).slice(0, 4).join(' ') || 'No summary yet.'}`,
      '',
      '## Notes',
      '',
      ...category.notes.map((note) => `- [[${note.id}]] ${note.title} - ${note.summary}`),
      '',
    ].join('\n');
    await writeFile(path.join(categoriesDir, `${category.slug}.md`), body);
  }
}

/**
 * Persists the knowledge index JSON.
 */
export async function writeIndexJson(state) {
  if (READ_ONLY_MODE) return;
  await writeFile(indexPath, JSON.stringify(state, null, 2));
}
