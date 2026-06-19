/**
 * note-parser.util.ts — pure functions for reading and writing markdown notes.
 *
 * Shared by NoteFileRepository (reading), NotesService (composing updates),
 * CodexService (parsing AI output), and KnowledgeService (slug generation).
 *
 * All functions are stateless and have no side effects. They can be imported
 * anywhere without creating circular dependencies.
 *
 * Key functions:
 *  - parseNote(file, markdown)  — extract typed KnowledgeNote from frontmatter
 *  - composeMarkdown(fields)    — write canonical markdown from note data
 *  - slugify(value)             — URL-safe note id from title
 *  - uniqueNoteSlug(title, dir) — collision-free slug for new notes
 *  - noteRelativePath(id, cat)  — maps note id + category to filesystem path
 *  - stripFrontmatter(markdown) — body-only markdown for the editor
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { KnowledgeNote } from '../types';

export function escapeFrontmatter(value: string): string {
  return String(value || '').replace(/\n/g, ' ').replace(/"/g, '\\"');
}

export function normalizeArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set((value as unknown[]).map((item) => String(item).trim()).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
  }
  return [];
}

function parseArrayField(text: string, field: string): string[] {
  const line = text.match(new RegExp(`^${field}:\\s*\\[(.*)\\]`, 'm'))?.[1] || '';
  return line
    .split(',')
    .map((item) => item.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || `note-${Date.now()}`;
}

export function normalizeCategoryPath(value: string): string {
  return String(value || 'Uncategorized')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/') || 'Uncategorized';
}

function safeFolderSegment(value: string): string {
  const segment = String(value || '').trim().replace(/[<>:"\\|?*\x00-\x1F]/g, '-');
  if (!segment || /^\.+$/.test(segment)) return 'Uncategorized';
  return segment;
}

export function noteRelativePath(noteId: string, category: string): string {
  const parts = normalizeCategoryPath(category).split('/').map(safeFolderSegment);
  return join(...parts, `${basename(noteId)}.md`);
}

export function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---[\s\S]*?---\s*/, '');
}

export function composeMarkdown(fields: {
  title: string;
  category: string;
  summary: string;
  tags: unknown;
  links: unknown;
  bilinks?: unknown;
  createdAt: string;
  sourceUrl?: string;
  originalRequest?: string;
  body: string;
}): string {
  const cleanTitle = String(fields.title || 'Untitled note').trim();
  const cleanBody = String(fields.body || '').trim() || `# ${cleanTitle}\n\n## What I learned\n\n`;
  const sourceUrlLine = fields.sourceUrl ? `sourceUrl: "${escapeFrontmatter(fields.sourceUrl)}"\n` : '';
  const originalRequestLine = fields.originalRequest ? `originalRequest: "${escapeFrontmatter(fields.originalRequest)}"\n` : '';
  const bilinksArr = normalizeArray(fields.bilinks);
  const bilinksLine = bilinksArr.length > 0
    ? `bilinks: [${bilinksArr.map((l) => `"${escapeFrontmatter(l)}"`).join(', ')}]\n`
    : '';
  return `---
title: "${escapeFrontmatter(cleanTitle)}"
category: "${escapeFrontmatter(normalizeCategoryPath(fields.category || 'Uncategorized'))}"
summary: "${escapeFrontmatter(fields.summary || '')}"
tags: [${normalizeArray(fields.tags).map((tag) => `"${escapeFrontmatter(tag)}"`).join(', ')}]
links: [${normalizeArray(fields.links).map((link) => `"${escapeFrontmatter(link)}"`).join(', ')}]
${bilinksLine}createdAt: "${escapeFrontmatter(fields.createdAt || new Date().toISOString())}"
${sourceUrlLine}${originalRequestLine}
---

${cleanBody}
`;
}

export function parseNote(fileName: string, markdown: string): KnowledgeNote {
  const baseName = basename(fileName);
  const title = markdown.match(/^title:\s*"?(.*?)"?$/m)?.[1] || baseName.replace(/\.md$/, '');
  const category = normalizeCategoryPath(markdown.match(/^category:\s*"?(.*?)"?$/m)?.[1] || 'Uncategorized');
  const summary = markdown.match(/^summary:\s*"?(.*?)"?$/m)?.[1] || '';
  const createdAt = markdown.match(/^createdAt:\s*"?(.*?)"?$/m)?.[1] || '';
  const sourceUrl = markdown.match(/^sourceUrl:\s*"?(.*?)"?$/m)?.[1] || '';
  const originalRequest = markdown.match(/^originalRequest:\s*"?(.*?)"?$/m)?.[1] || '';
  return {
    id: baseName.replace(/\.md$/, ''),
    fileName: baseName,
    path: `knowledge/notes/${fileName.split(/[/\\]/).join('/')}`,
    title,
    category,
    summary,
    tags: parseArrayField(markdown, 'tags'),
    links: parseArrayField(markdown, 'links'),
    bilinks: parseArrayField(markdown, 'bilinks'),
    createdAt,
    sourceUrl,
    originalRequest,
  };
}

export function noteIdExistsSync(id: string, dir: string): boolean {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absolute = join(dir, entry.name);
    if (entry.isDirectory() && noteIdExistsSync(id, absolute)) return true;
    if (entry.isFile() && entry.name === `${id}.md`) return true;
  }
  return false;
}

export function uniqueNoteSlug(title: string, notesDir: string): string {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const base = `${datePrefix}-${slugify(title)}`;
  let candidate = base;
  let suffix = 2;
  while (noteIdExistsSync(candidate, notesDir)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
