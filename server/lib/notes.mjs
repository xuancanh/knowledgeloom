import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { categoriesDir, indexPath, notesDir, READ_ONLY_MODE } from './config.mjs';
import { syncFlashcards } from './flashcards.mjs';
import { deleteMeilisearchDocument, syncMeilisearch } from './meili.mjs';
import { deleteRemindersForNote } from './reminders.mjs';

// Notes are the source of truth. Everything else in knowledge/ is rebuilt from
// markdown frontmatter and body content in knowledge/notes.
/**
 * Ensures the local knowledge store exists before any route or job touches it.
 */
export async function ensureStore() {
  if (READ_ONLY_MODE) return;
  await mkdir(notesDir, { recursive: true });
  await mkdir(categoriesDir, { recursive: true });
  if (!existsSync(indexPath)) {
    await writeFile(indexPath, JSON.stringify({ notes: [], categories: [] }, null, 2));
  }
}

/**
 * Converts arbitrary titles/categories into filesystem-safe ids.
 */
export function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || `note-${Date.now()}`;
}

/**
 * Normalizes category folder paths on the backend before they reach derived
 * indexes. This keeps `Engineering/Frontend`, `Engineering / Frontend`, and
 * accidental repeated separators from becoming separate folders.
 */
function normalizeCategoryPath(value) {
  return String(value || 'Uncategorized')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/') || 'Uncategorized';
}

/**
 * Converts a category path segment into a safe folder name while keeping it
 * readable on disk. Note ids remain file basenames; category folders provide
 * physical organization only.
 */
function safeFolderSegment(value) {
  const segment = String(value || '').trim().replace(/[<>:"\\|?*\x00-\x1F]/g, '-');
  if (!segment || /^\.+$/.test(segment)) return 'Uncategorized';
  return segment;
}

/**
 * Returns the relative folder/file path where a note should live for its
 * category. A note in `Engineering/Frontend` becomes
 * `Engineering/Frontend/<note-id>.md`.
 */
function noteRelativePathForCategory(noteId, category) {
  const parts = normalizeCategoryPath(category).split('/').map(safeFolderSegment);
  return path.join(...parts, `${path.basename(noteId)}.md`);
}

/**
 * Recursively lists markdown files below the notes root.
 */
async function listNoteFiles(dir = notesDir, prefix = '') {
  await ensureStore();
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
async function findNoteFileById(id) {
  const safeId = path.basename(id);
  const fileName = `${safeId}.md`;
  const files = await listNoteFiles();
  return files.find((file) => path.basename(file) === fileName) || null;
}

/**
 * Synchronous note-id lookup used only during slug creation.
 */
function noteIdExistsSync(id, dir = notesDir) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory() && noteIdExistsSync(id, absolute)) return true;
    if (entry.isFile() && entry.name === `${id}.md`) return true;
  }
  return false;
}

/**
 * Removes frontmatter from markdown so the UI can edit only the note body.
 */
export function stripFrontmatter(markdown) {
  return markdown.replace(/^---[\s\S]*?---\s*/, '');
}

/**
 * Escapes a scalar for the simple frontmatter format this app writes.
 */
function escapeFrontmatter(value) {
  return String(value || '').replace(/\n/g, ' ').replace(/"/g, '\\"');
}

/**
 * Normalizes tags/links coming from either API arrays or comma-separated text.
 */
function normalizeArray(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  }
  return [];
}

/**
 * Parses a frontmatter array line like `tags: ["a", "b"]`.
 */
function parseArrayField(text, field) {
  const line = text.match(new RegExp(`^${field}:\\s*\\[(.*)\\]`, 'm'))?.[1] || '';
  return line
    .split(',')
    .map((item) => item.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

/**
 * Writes the canonical markdown representation for a note.
 */
export function composeMarkdown({ title, category, summary, tags, links, createdAt, sourceUrl, originalRequest, body }) {
  const cleanTitle = String(title || 'Untitled note').trim();
  const cleanBody = String(body || '').trim() || `# ${cleanTitle}\n\n## What I learned\n\n`;
  const sourceUrlLine = sourceUrl ? `sourceUrl: "${escapeFrontmatter(sourceUrl)}"\n` : '';
  const originalRequestLine = originalRequest ? `originalRequest: "${escapeFrontmatter(originalRequest)}"\n` : '';
  return `---
title: "${escapeFrontmatter(cleanTitle)}"
category: "${escapeFrontmatter(normalizeCategoryPath(category || 'Uncategorized'))}"
summary: "${escapeFrontmatter(summary || '')}"
tags: [${normalizeArray(tags).map((tag) => `"${escapeFrontmatter(tag)}"`).join(', ')}]
links: [${normalizeArray(links).map((link) => `"${escapeFrontmatter(link)}"`).join(', ')}]
createdAt: "${escapeFrontmatter(createdAt || new Date().toISOString())}"
${sourceUrlLine}${originalRequestLine}
---

${cleanBody}
`;
}

/**
 * Chooses a note id that is stable enough to read but will not overwrite an
 * existing markdown file.
 *
 * The date prefix keeps generated/manual notes grouped chronologically. The
 * numeric suffix only appears on collisions, which can happen when the same
 * topic is captured more than once in a day.
 */
export function uniqueNoteSlug(title) {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const base = `${datePrefix}-${slugify(title)}`;
  let candidate = base;
  let suffix = 2;
  while (noteIdExistsSync(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/**
 * Extracts note metadata from frontmatter and attaches filesystem identifiers.
 */
export function parseNote(fileName, markdown) {
  const baseName = path.basename(fileName);
  const title = markdown.match(/^title:\s*"?(.*?)"?$/m)?.[1] || baseName.replace(/\.md$/, '');
  const category = normalizeCategoryPath(markdown.match(/^category:\s*"?(.*?)"?$/m)?.[1] || 'Uncategorized');
  const summary = markdown.match(/^summary:\s*"?(.*?)"?$/m)?.[1] || '';
  const createdAt = markdown.match(/^createdAt:\s*"?(.*?)"?$/m)?.[1] || '';
  const sourceUrl = markdown.match(/^sourceUrl:\s*"?(.*?)"?$/m)?.[1] || '';
  const originalRequest = markdown.match(/^originalRequest:\s*"?(.*?)"?$/m)?.[1] || '';
  return {
    id: baseName.replace(/\.md$/, ''),
    fileName: baseName,
    path: `knowledge/notes/${fileName.split(path.sep).join('/')}`,
    title,
    category,
    summary,
    tags: parseArrayField(markdown, 'tags'),
    links: parseArrayField(markdown, 'links'),
    createdAt,
    sourceUrl,
    originalRequest,
  };
}

/**
 * Reads all markdown notes and returns parsed metadata sorted by filename.
 */
export async function loadNotes() {
  await ensureStore();
  const files = await listNoteFiles();
  const notes = [];
  for (const file of files) {
    const markdown = await readFile(path.join(notesDir, file), 'utf8');
    notes.push(parseNote(file, markdown));
  }
  return notes;
}

/**
 * Rebuilds every derived artifact from markdown source files.
 *
 * This intentionally rewrites category indexes and replaces Meilisearch docs on
 * every mutation. It is less clever than incremental sync, but it keeps local
 * state understandable and prevents stale category/search data after deletes.
 */
export async function rebuildIndexes() {
  const files = await listNoteFiles();
  const noteSources = [];
  for (const file of files) {
    const markdown = await readFile(path.join(notesDir, file), 'utf8');
    noteSources.push({ file, markdown, note: parseNote(file, markdown) });
  }

  /*
   * Keep the physical vault layout aligned with the logical category path.
   * This migration runs on every rebuild so direct edits, AI edits, and newly
   * generated notes settle into the right folder automatically.
   */
  if (!READ_ONLY_MODE) {
    for (const source of noteSources) {
      const desiredFile = noteRelativePathForCategory(source.note.id, source.note.category);
      if (source.file === desiredFile) continue;
      const destination = path.join(notesDir, desiredFile);
      await mkdir(path.dirname(destination), { recursive: true });
      if (existsSync(destination)) {
        const error = new Error(`cannot move ${source.file}; ${desiredFile} already exists`);
        error.status = 409;
        throw error;
      }
      await writeFile(destination, source.markdown);
      await rm(path.join(notesDir, source.file), { force: true });
      source.file = desiredFile;
      source.note = parseNote(desiredFile, source.markdown);
    }
  }

  const notes = noteSources.map((item) => item.note);
  const categoryMap = new Map();

  for (const note of notes) {
    const existing = categoryMap.get(note.category) || {
      name: note.category,
      slug: slugify(note.category),
      count: 0,
      summaries: [],
      notes: [],
    };
    existing.count += 1;
    existing.summaries.push(note.summary);
    existing.notes.push({ id: note.id, title: note.title, summary: note.summary });
    categoryMap.set(note.category, existing);
  }

  const categories = [...categoryMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (!READ_ONLY_MODE) {
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

  // Graph edges only include links that resolve to an existing note. Broken
  // links remain in source markdown but are excluded from graph visualization.
  const graph = notes.map((note) => ({
    source: note.id,
    targets: note.links.filter((target) => notes.some((candidate) => candidate.id === target)),
  }));
  const flashcards = await syncFlashcards(noteSources);

  const state = { notes, categories, graph, flashcards, updatedAt: new Date().toISOString() };
  if (!READ_ONLY_MODE) {
    await writeFile(indexPath, JSON.stringify(state, null, 2));
    await syncMeilisearch(state).catch((error) => {
      console.warn(`Meilisearch sync skipped: ${error.message}`);
    });
  }
  return state;
}

/**
 * Loads raw markdown for the editor/source drawer.
 */
export async function readNoteMarkdown(id) {
  const file = await findNoteFileById(id);
  if (!file) {
    const error = new Error('note not found');
    error.status = 404;
    throw error;
  }
  return readFile(path.join(notesDir, file), 'utf8');
}

/**
 * Creates a note from user-authored content without invoking Codex.
 *
 * This is the implementation behind the "Save as written" capture mode. It
 * still routes through the canonical markdown composer and index rebuild so
 * direct notes behave exactly like AI-created notes in category pages,
 * backlinks, and Meilisearch.
 */
export async function createKnowledgeNoteFromDraft(draft) {
  assertWritable();
  const title = String(draft.title || '').trim();
  const body = String(draft.body || '').trim();
  if (!title || !body) {
    const error = new Error('title and body are required');
    error.status = 400;
    throw error;
  }

  const slug = uniqueNoteSlug(title);
  const markdown = composeMarkdown({
    title,
    category: draft.category || 'Uncategorized',
    summary: draft.summary || '',
    tags: draft.tags || [],
    links: draft.links || [],
    createdAt: draft.createdAt || new Date().toISOString(),
    body,
  });

  const notePath = path.join(notesDir, noteRelativePathForCategory(slug, draft.category || 'Uncategorized'));
  await mkdir(path.dirname(notePath), { recursive: true });
  await writeFile(notePath, markdown);
  const state = await rebuildIndexes();
  const note = state.notes.find((item) => item.id === slug);
  return { note, state, markdown, codexStatus: 'not-used' };
}

/**
 * Rewrites one note file from editor data and rebuilds derived state.
 */
export async function updateKnowledgeNote(id, updates) {
  assertWritable();
  const safeId = path.basename(id);
  const currentFile = await findNoteFileById(safeId);
  if (!currentFile) {
    const error = new Error('note not found');
    error.status = 404;
    throw error;
  }
  const notePath = path.join(notesDir, currentFile);

  const currentMarkdown = await readFile(notePath, 'utf8');
  const current = parseNote(currentFile, currentMarkdown);
  const markdown = composeMarkdown({
    title: updates.title ?? current.title,
    category: updates.category ?? current.category,
    summary: updates.summary ?? current.summary,
    tags: updates.tags ?? current.tags,
    links: updates.links ?? current.links,
    createdAt: updates.createdAt ?? current.createdAt,
    sourceUrl: updates.sourceUrl ?? current.sourceUrl,
    originalRequest: updates.originalRequest ?? current.originalRequest,
    body: updates.body ?? stripFrontmatter(currentMarkdown),
  });

  const nextCategory = updates.category ?? current.category;
  const nextFile = noteRelativePathForCategory(safeId, nextCategory);
  const nextPath = path.join(notesDir, nextFile);
  await mkdir(path.dirname(nextPath), { recursive: true });
  await writeFile(nextPath, markdown);
  if (nextPath !== notePath) await rm(notePath, { force: true });
  const state = await rebuildIndexes();
  const note = state.notes.find((item) => item.id === safeId);
  return { note, state, markdown };
}

/**
 * Deletes one note source file and rebuilds derived state.
 *
 * Search cleanup is explicit here, not only left to the later index rebuild.
 * The rebuild still runs afterward so category files, backlinks, JSON state,
 * and the Meilisearch sync manifest converge on the markdown source of truth.
 */
export async function deleteKnowledgeNote(id) {
  assertWritable();
  const safeId = path.basename(id);
  const currentFile = await findNoteFileById(safeId);
  if (!currentFile) {
    const error = new Error('note not found');
    error.status = 404;
    throw error;
  }
  const notePath = path.join(notesDir, currentFile);
  await rm(notePath, { force: true });
  deleteRemindersForNote(safeId);
  await deleteMeilisearchDocument(safeId).catch((error) => {
    console.warn(`Meilisearch delete skipped for ${safeId}: ${error.message}`);
  });
  const state = await rebuildIndexes();
  return { deleted: safeId, state };
}

/**
 * Prevents file mutation in read-only cloud deployments.
 */
function assertWritable() {
  if (!READ_ONLY_MODE) return;
  const error = new Error('service is running in read-only mode');
  error.status = 403;
  throw error;
}
