/**
 * Tests for frontend pure utility functions (no React / DOM required).
 *
 * Run: npm run test:frontend
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { toLocalDateTimeInputValue, formatJobDate } from '../src/lib/format';
import {
  categoryId,
  normalizeCategoryPath,
  categoryLabel,
  categoryContains,
  formatCreated,
  formatJobTime,
  jobState,
  stripFrontmatter,
  parseMarkdownBlocks,
  noteSearchText,
  makeUiCategories,
  makeCategoryTree,
} from '../src/lib/view';
import {
  addTemplate,
  updateTemplate,
  deleteTemplate,
  templatesForMode,
  DEFAULT_TEMPLATES,
} from '../src/lib/guidance';

// ── format.ts ───────────────────────────────────────────────────────────────

test('toLocalDateTimeInputValue returns wall-clock time for datetime-local', () => {
  const d = new Date('2026-01-15T14:30:00Z');
  const result = toLocalDateTimeInputValue(d);
  assert.ok(result.startsWith('2026-01-15'));
  assert.equal(result.length, 16);
  assert.ok(result.includes('T'));
});

test('toLocalDateTimeInputValue returns valid ISO slice format', () => {
  const d = new Date('2026-06-01T08:00:00Z');
  const result = toLocalDateTimeInputValue(d);
  assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('formatJobDate returns "Today HH:MM" for today', () => {
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const result = formatJobDate(now.toISOString());
  assert.equal(result, `Today ${hhmm}`);
});

test('formatJobDate returns "—" for null/undefined/empty', () => {
  assert.equal(formatJobDate(null!), '—');
  assert.equal(formatJobDate(undefined!), '—');
  assert.equal(formatJobDate(''), '—');
});

test('formatJobDate returns "Yesterday HH:MM" for yesterday', () => {
  const yesterday = new Date(Date.now() - 86400000);
  const hhmm = `${String(yesterday.getHours()).padStart(2, '0')}:${String(yesterday.getMinutes()).padStart(2, '0')}`;
  const result = formatJobDate(yesterday.toISOString());
  assert.equal(result, `Yesterday ${hhmm}`);
});

test('formatJobDate returns short date for older timestamps', () => {
  const oldDate = new Date('2025-03-15T10:30:00Z');
  const result = formatJobDate(oldDate.toISOString());
  assert.match(result, /^Mar 15 \d{2}:\d{2}$/);
});

// ── view.tsx: path helpers ──────────────────────────────────────────────────

test('normalizeCategoryPath trims whitespace and collapses separators', () => {
  assert.equal(normalizeCategoryPath(' Engineering / Backend '), 'Engineering/Backend');
  assert.equal(normalizeCategoryPath('///'), 'Uncategorized');
  assert.equal(normalizeCategoryPath(''), 'Uncategorized');
  assert.equal(normalizeCategoryPath('Single'), 'Single');
});

test('categoryId delegates to normalizeCategoryPath', () => {
  assert.equal(categoryId(' Foo / Bar '), 'Foo/Bar');
  assert.equal(categoryId(''), 'Uncategorized');
});

test('categoryLabel returns the last path segment', () => {
  assert.equal(categoryLabel('Engineering/Backend'), 'Backend');
  assert.equal(categoryLabel('Single'), 'Single');
  assert.equal(categoryLabel(''), 'Uncategorized');
  assert.equal(categoryLabel('Uncategorized'), 'Uncategorized');
});

test('categoryContains checks path ancestry', () => {
  assert.ok(categoryContains('Engineering', 'Engineering/Backend'));
  assert.ok(categoryContains('Engineering', 'Engineering'));
  assert.ok(!categoryContains('Engineering', 'Design'));
  assert.ok(!categoryContains('Engineering/Backend', 'Engineering'));
  assert.ok(categoryContains('a/b', 'a/b/c'));
  assert.ok(categoryContains('  a / b ', 'a/b/c'));
});

// ── view.tsx: format helpers ────────────────────────────────────────────────

test('formatCreated returns ISO date substring', () => {
  assert.equal(formatCreated('2026-01-15T14:30:00.000Z'), '2026-01-15');
  assert.equal(formatCreated(''), 'unknown');
});

test('formatJobTime formats hours and minutes in local time', () => {
  const date = new Date();
  const hhmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  assert.equal(formatJobTime(date.toISOString()), hhmm);
  assert.equal(formatJobTime(null), '--:--');
  assert.equal(formatJobTime(undefined), '--:--');
});

test('jobState maps backend statuses to UI states', () => {
  assert.equal(jobState({ status: 'running' } as any), 'researching');
  assert.equal(jobState({ status: 'done' } as any), 'saved');
  assert.equal(jobState({ status: 'error' } as any), 'failed');
  assert.equal(jobState({ status: 'queued' } as any), 'queued');
});

// ── view.tsx: markdown helpers ──────────────────────────────────────────────

test('stripFrontmatter removes YAML frontmatter', () => {
  const markdown = `---
title: Hello
tags: [a, b]
---

# Body starts here

Some text.`;

  const result = stripFrontmatter(markdown);
  assert.ok(result.startsWith('# Body'));
  assert.ok(!result.includes('---'));
  assert.ok(result.includes('Some text.'));
});

test('stripFrontmatter handles markdown without frontmatter', () => {
  const markdown = '# Just a heading\n\nContent.';
  assert.equal(stripFrontmatter(markdown), markdown.trim());
});

test('parseMarkdownBlocks produces paragraph, heading, and quote blocks', () => {
  const markdown = `# Title (skipped)

## Section One

Plain text here.

> A quote

- Bullet point

### Subsection`;

  const blocks = parseMarkdownBlocks(markdown);
  assert.ok(blocks.some((b: any) => b.type === 'h'));
  assert.ok(blocks.some((b: any) => b.type === 'p'));
  assert.ok(blocks.some((b: any) => b.type === 'q'));
});

test('parseMarkdownBlocks returns fallback for empty body', () => {
  const blocks = parseMarkdownBlocks('');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, 'No body content yet.');
});

test('parseMarkdownBlocks joins consecutive paragraphs', () => {
  const markdown = 'Line one.\nLine two.\n\n## Heading';
  const blocks = parseMarkdownBlocks(markdown);
  const para = blocks.find((b: any) => b.type === 'p');
  assert.ok(para);
  assert.ok(para.text.includes('Line one.'));
  assert.ok(para.text.includes('Line two.'));
});

// ── view.tsx: search helpers ────────────────────────────────────────────────

test('noteSearchText combines title, summary, and tags lowercase', () => {
  const note: any = { title: 'Hello', summary: 'World', tags: ['React', 'TS'] };
  const result = noteSearchText(note);
  assert.ok(result.includes('hello'));
  assert.ok(result.includes('world'));
  assert.ok(result.includes('react'));
  assert.ok(result.includes('ts'));
});

// ── view.tsx: category tree ─────────────────────────────────────────────────

test('makeUiCategories assigns ids and colors', () => {
  const input: any[] = [
    { name: 'Engineering', slug: 'engineering', count: 3, summaries: ['Build things'], notes: [] },
    { name: 'Design', slug: 'design', count: 1, summaries: [], notes: [] },
  ];
  const result = makeUiCategories(input);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'Engineering');
  assert.equal(result[1].id, 'Design');
  assert.ok(result[0].color);
  assert.ok(result[1].color);
  assert.notEqual(result[0].color, result[1].color);
});

test('makeUiCategories normalizes path names', () => {
  const input: any[] = [
    { name: ' Foo / Bar ', slug: 'foo-bar', count: 1, summaries: [], notes: [] },
  ];
  const result = makeUiCategories(input);
  assert.equal(result[0].id, 'Foo/Bar');
});

test('makeCategoryTree builds nested tree from flat categories', () => {
  const categories = makeUiCategories([
    { name: 'Engineering', slug: 'eng', count: 2, summaries: [], notes: [] } as any,
    { name: 'Engineering/Backend', slug: 'eng-be', count: 3, summaries: [], notes: [] } as any,
    { name: 'Design', slug: 'design', count: 1, summaries: [], notes: [] } as any,
  ]);
  const tree = makeCategoryTree(categories);

  assert.equal(tree.length, 2);
  const eng = tree.find((n) => n.id === 'Engineering')!;
  assert.ok(eng);
  assert.equal(eng.count, 5);
  assert.equal(eng.children.length, 1);
  assert.equal(eng.children[0].id, 'Engineering/Backend');
});

// ── guidance.ts ─────────────────────────────────────────────────────────────

test('DEFAULT_TEMPLATES includes built-in research and link templates', () => {
  const research = templatesForMode(DEFAULT_TEMPLATES, 'research');
  const link = templatesForMode(DEFAULT_TEMPLATES, 'link');
  assert.ok(research.length > 0);
  assert.ok(link.length > 0);
  assert.ok(DEFAULT_TEMPLATES.every((t) => t.builtIn));
});

test('templatesForMode filters by mode and "both"', () => {
  const templates: any[] = [
    { id: '1', label: 'A', text: '', mode: 'research', builtIn: true },
    { id: '2', label: 'B', text: '', mode: 'link', builtIn: true },
    { id: '3', label: 'C', text: '', mode: 'both', builtIn: true },
  ];
  assert.equal(templatesForMode(templates as any, 'research').length, 2);
  assert.equal(templatesForMode(templates as any, 'link').length, 2);
});

test('addTemplate adds a custom template with generated id', () => {
  const before: any[] = [{ id: 'builtin-1', label: 'X', text: 'foo', mode: 'research', builtIn: true }];
  const after = addTemplate(before, { label: 'Custom', text: 'bar', mode: 'link' });
  assert.equal(after.length, 2);
  assert.ok(after[1].id.startsWith('custom-'));
  assert.equal(after[1].label, 'Custom');
  assert.equal(after[1].builtIn, undefined);
});

test('updateTemplate patches fields by id', () => {
  const templates: any[] = [
    { id: '1', label: 'Old', text: 'old text', mode: 'research', builtIn: true },
  ];
  const updated = updateTemplate(templates, '1', { label: 'New', text: 'new text' });
  assert.equal(updated[0].label, 'New');
  assert.equal(updated[0].text, 'new text');
  assert.equal(updated[0].mode, 'research');
});

test('updateTemplate is a no-op for unknown id', () => {
  const templates: any[] = [{ id: '1', label: 'A', text: 'a', mode: 'research', builtIn: true }];
  const updated = updateTemplate(templates, 'unknown', { label: 'B' });
  assert.deepEqual(updated, templates);
});

test('deleteTemplate removes by id', () => {
  const templates: any[] = [
    { id: '1', label: 'A', text: 'a', mode: 'research', builtIn: true },
    { id: '2', label: 'B', text: 'b', mode: 'link', builtIn: true },
  ];
  const result = deleteTemplate(templates, '1');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, '2');
});

// loadTemplates reads window.localStorage — not testable in Node without DOM.
// The function falls back to DEFAULT_TEMPLATES on any error (covered by the
// other guidance.ts tests which exercise the pure logic: add/update/delete/filter).
