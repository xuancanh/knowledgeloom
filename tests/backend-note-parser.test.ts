/**
 * BDD-style tests for note-parser.util.ts — pure functions for reading,
 * writing, and manipulating markdown notes.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseNote,
  composeMarkdown,
  slugify,
  uniqueNoteSlug,
  noteRelativePath,
  normalizeCategoryPath,
  stripFrontmatter,
  escapeFrontmatter,
  normalizeArray,
  noteIdExistsSync,
} from '../server/src/common/note-parser.util';

// ── parseNote ────────────────────────────────────────────────────────────────

test('parseNote: extracts all frontmatter fields from a well-formed note', () => {
  const md = `---
title: "Bounded Context in DDD"
category: "Software Architecture"
summary: "Exploring bounded context patterns"
tags: ["ddd", "architecture", "design"]
links: ["note-123", "note-456"]
createdAt: "2024-01-15T10:00:00.000Z"
---
# Bounded Context

Body text here.`;

  const note = parseNote('2024-01-15-bounded-context.md', md);

  assert.equal(note.id, '2024-01-15-bounded-context');
  assert.equal(note.title, 'Bounded Context in DDD');
  assert.equal(note.category, 'Software Architecture');
  assert.equal(note.summary, 'Exploring bounded context patterns');
  assert.deepEqual(note.tags, ['ddd', 'architecture', 'design']);
  assert.deepEqual(note.links, ['note-123', 'note-456']);
  assert.equal(note.createdAt, '2024-01-15T10:00:00.000Z');
});

test('parseNote: returns defaults when frontmatter fields are missing', () => {
  const md = `---
title: "Minimal Note"
---
# Minimal Note

Just a body.`;

  const note = parseNote('minimal.md', md);

  assert.equal(note.title, 'Minimal Note');
  assert.equal(note.category, 'Uncategorized');
  assert.equal(note.summary, '');
  assert.deepEqual(note.tags, []);
  assert.deepEqual(note.links, []);
});

test('parseNote: falls back to filename when markdown has no frontmatter title', () => {
  const md = '# Just a heading\n\nSome content.';

  const note = parseNote('no-frontmatter.md', md);

  assert.equal(note.id, 'no-frontmatter');
  // Title falls back to the filename (without .md) when frontmatter is absent
  assert.equal(note.title, 'no-frontmatter');
  assert.equal(note.category, 'Uncategorized');
});

test('parseNote: extracts id from filename without .md extension', () => {
  const md = `---
title: "Test"
---
# Test`;

  const note = parseNote('engineering/2024-06-01-pattern.md', md);

  assert.equal(note.id, '2024-06-01-pattern');
});

// ── composeMarkdown ──────────────────────────────────────────────────────────

test('composeMarkdown: produces canonical markdown with all fields', () => {
  const markdown = composeMarkdown({
    title: 'Test Note',
    category: 'Engineering/Backend',
    summary: 'A test summary',
    tags: ['go', 'api'],
    links: ['note-a'],
    createdAt: '2024-01-15T10:00:00.000Z',
    body: '# Test Note\n\nContent here.',
  });

  assert.ok(markdown.startsWith('---\n'));
  assert.ok(markdown.includes('title: "Test Note"'));
  assert.ok(markdown.includes('category: "Engineering/Backend"'));
  assert.ok(markdown.includes('summary: "A test summary"'));
  assert.ok(markdown.includes('tags: ["go", "api"]'));
  assert.ok(markdown.includes('links: ["note-a"]'));
  assert.ok(markdown.includes('createdAt: "2024-01-15T10:00:00.000Z"'));
  assert.ok(markdown.includes('---\n\n# Test Note\n\nContent here.\n'));
});

test('composeMarkdown: normalizes tags and links as comma-separated strings', () => {
  const markdown = composeMarkdown({
    title: 'X',
    category: 'General',
    summary: '',
    tags: 'a, b, c',
    links: 'link1, link2',
    createdAt: '2024-01-01T00:00:00.000Z',
    body: 'body',
  });

  assert.ok(markdown.includes('tags: ["a", "b", "c"]'));
  assert.ok(markdown.includes('links: ["link1", "link2"]'));
});

test('composeMarkdown: defaults empty arrays gracefully', () => {
  const markdown = composeMarkdown({
    title: 'X',
    category: 'General',
    summary: '',
    tags: [],
    links: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    body: 'body',
  });

  assert.ok(markdown.includes('tags: []'));
  assert.ok(markdown.includes('links: []'));
});

// ── slugify ──────────────────────────────────────────────────────────────────

test('slugify: produces lowercase URL-safe slugs', () => {
  assert.equal(slugify('Hello World'), 'hello-world');
  assert.equal(slugify('Bounded Context in DDD'), 'bounded-context-in-ddd');
  assert.equal(slugify('C++ Templates'), 'c-templates');
  assert.equal(slugify('  Leading/Trailing  '), 'leading-trailing');
});

test('slugify: truncates to 72 characters max', () => {
  const long = 'a'.repeat(100);
  const result = slugify(long);
  assert.ok(result.length <= 72);
});

test('slugify: falls back to note-timestamp for empty input', () => {
  const result = slugify('');
  assert.ok(result.startsWith('note-'));
});

// ── uniqueNoteSlug ───────────────────────────────────────────────────────────

test('uniqueNoteSlug: generates a date-prefixed slug when no collision', () => {
  const dir = mkdtempSync(join(tmpdir(), 'note-slug-test-'));
  try {
    const slug = uniqueNoteSlug('My Note', dir);
    assert.match(slug, /^\d{4}-\d{2}-\d{2}-my-note$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('uniqueNoteSlug: appends suffix when slug already exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'note-slug-test-'));
  try {
    const slug1 = uniqueNoteSlug('Test', dir);
    writeFileSync(join(dir, `${slug1}.md`), '# test');
    const slug2 = uniqueNoteSlug('Test', dir);
    assert.notEqual(slug1, slug2);
    assert.ok(slug2.endsWith('-2'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── noteRelativePath ─────────────────────────────────────────────────────────

test('noteRelativePath: builds path from id and category', () => {
  assert.equal(
    noteRelativePath('2024-01-15-go-patterns', 'Engineering/Backend'),
    'Engineering/Backend/2024-01-15-go-patterns.md',
  );
  assert.equal(
    noteRelativePath('my-note', 'Uncategorized'),
    'Uncategorized/my-note.md',
  );
});

// ── normalizeCategoryPath ────────────────────────────────────────────────────

test('normalizeCategoryPath: trims and collapses separators', () => {
  assert.equal(normalizeCategoryPath(' Engineering / Backend '), 'Engineering/Backend');
  assert.equal(normalizeCategoryPath('///'), 'Uncategorized');
  assert.equal(normalizeCategoryPath(''), 'Uncategorized');
  assert.equal(normalizeCategoryPath('Single'), 'Single');
  assert.equal(normalizeCategoryPath('a /  b  / c'), 'a/b/c');
});

// ── stripFrontmatter ─────────────────────────────────────────────────────────

test('stripFrontmatter: removes YAML frontmatter and returns body', () => {
  const md = `---
title: "Hello"
tags: [a, b]
---

# Body starts here

Some text.`;

  const result = stripFrontmatter(md);
  assert.ok(result.startsWith('# Body'));
  assert.ok(!result.includes('---'));
  assert.ok(result.includes('Some text.'));
});

test('stripFrontmatter: returns body unchanged when no frontmatter', () => {
  const md = '# Just a heading\n\nContent.';
  assert.equal(stripFrontmatter(md), md.trim());
});

test('stripFrontmatter: handles empty string', () => {
  assert.equal(stripFrontmatter(''), '');
});

// ── escapeFrontmatter ────────────────────────────────────────────────────────

test('escapeFrontmatter: replaces newlines and quotes', () => {
  assert.equal(escapeFrontmatter('line1\nline2'), 'line1 line2');
  assert.equal(escapeFrontmatter('he said "hello"'), 'he said \\"hello\\"');
  assert.equal(escapeFrontmatter('clean text'), 'clean text');
});

// ── normalizeArray ───────────────────────────────────────────────────────────

test('normalizeArray: accepts string array as-is', () => {
  assert.deepEqual(normalizeArray(['a', 'b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(normalizeArray([]), []);
});

test('normalizeArray: splits comma-separated strings', () => {
  assert.deepEqual(normalizeArray('a, b, c'), ['a', 'b', 'c']);
  assert.deepEqual(normalizeArray('single'), ['single']);
});

test('normalizeArray: deduplicates and trims entries', () => {
  assert.deepEqual(normalizeArray('a, b, a,  c , b'), ['a', 'b', 'c']);
});

// ── noteIdExistsSync ─────────────────────────────────────────────────────────

test('noteIdExistsSync: finds existing note by id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'note-exists-test-'));
  try {
    mkdirSync(join(dir, 'Engineering'), { recursive: true });
    writeFileSync(join(dir, 'Engineering', '2024-01-15-test.md'), '# test');

    assert.ok(noteIdExistsSync('2024-01-15-test', dir));
    assert.ok(!noteIdExistsSync('nonexistent', dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
