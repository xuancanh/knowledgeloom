import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { notesDir } from './config.mjs';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a scalar for the simple frontmatter format this app writes.
 */
export function escapeFrontmatter(value) {
  return String(value || '').replace(/\n/g, ' ').replace(/"/g, '\\"');
}

/**
 * Normalizes tags/links coming from either API arrays or comma-separated text.
 */
export function normalizeArray(value) {
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
export function parseArrayField(text, field) {
  const line = text.match(new RegExp(`^${field}:\\s*\\[(.*)\\]`, 'm'))?.[1] || '';
  return line
    .split(',')
    .map((item) => item.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function normalizeCategoryPath(value) {
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
export function noteRelativePath(noteId, category) {
  const parts = normalizeCategoryPath(category).split('/').map(safeFolderSegment);
  return path.join(...parts, `${path.basename(noteId)}.md`);
}

/**
 * Removes frontmatter from markdown so the UI can edit only the note body.
 */
export function stripFrontmatter(markdown) {
  return markdown.replace(/^---[\s\S]*?---\s*/, '');
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
