import test from 'node:test';
import assert from 'node:assert/strict';
import { NoteSourceCache } from '../server/src/notes/note-source-cache';
import type { KnowledgeNote } from '../server/src/types';

function source(id: string, markdown: string, version = 'v1') {
  const note = {
    id,
    title: id,
    category: 'Test',
    summary: '',
    tags: [],
    links: [],
    bilinks: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    path: `${id}.md`,
  } as KnowledgeNote;
  return { version, markdown, note };
}

test('note source cache: returns only the matching storage version', () => {
  const cache = new NoteSourceCache(1_024);
  cache.set('scope', 'a.md', source('a', 'alpha'));
  assert.equal(cache.get('scope', 'a.md', 'v1')?.note.id, 'a');
  assert.equal(cache.get('scope', 'a.md', 'v2'), null);
});

test('note source cache: evicts least-recently-used content at the byte limit', () => {
  const cache = new NoteSourceCache(10);
  cache.set('scope', 'a.md', source('a', '12345'));
  cache.set('scope', 'b.md', source('b', '67890'));
  assert.ok(cache.get('scope', 'a.md', 'v1'));
  cache.set('scope', 'c.md', source('c', 'abcde'));
  assert.equal(cache.get('scope', 'b.md', 'v1'), null);
  assert.ok(cache.get('scope', 'a.md', 'v1'));
  assert.ok(cache.get('scope', 'c.md', 'v1'));
});

test('note source cache: removes deleted paths without affecting other scopes', () => {
  const cache = new NoteSourceCache(1_024);
  cache.set('one', 'a.md', source('a', 'a'));
  cache.set('one', 'b.md', source('b', 'b'));
  cache.set('two', 'a.md', source('other-a', 'c'));
  cache.retain('one', new Set(['b.md']));
  assert.equal(cache.get('one', 'a.md', 'v1'), null);
  assert.ok(cache.get('one', 'b.md', 'v1'));
  assert.ok(cache.get('two', 'a.md', 'v1'));
});
