/**
 * BDD-style tests for the learn feature's pure content logic
 * (src/lib/learnContent.ts): deck building, mode filtering, plan ordering
 * with prerequisites, and card estimation.
 *
 * Run: npm run test:frontend
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeck, filterDeck, buildPlan, estimateCards, buildPodcastProgram, clip, firstSentence,
} from '../src/lib/learnContent';
import type { NoteForLearn, LearnCtx } from '../src/lib/learnContent';

function note(id: string, over: Partial<NoteForLearn> = {}): NoteForLearn {
  return {
    id,
    title: `Note ${id}`,
    category: 'cat-a',
    summary: `Summary of ${id}. It has two sentences.`,
    tags: ['t1'],
    links: [],
    createdAt: '2026-01-01T00:00:00Z',
    body: [
      { type: 'h', text: 'First section' },
      { type: 'p', text: `Body paragraph for ${id}. It explains the idea.` },
      { type: 'q', text: 'A memorable quote.' },
    ],
    markdown: '',
    ...over,
  } as NoteForLearn;
}

function ctxOf(notes: NoteForLearn[]): LearnCtx {
  return { notes, byId: Object.fromEntries(notes.map((n) => [n.id, n])) };
}

// ── text helpers ─────────────────────────────────────────────────────────────

test('clip: truncates at a word boundary with an ellipsis', () => {
  assert.equal(clip('short', 20), 'short');
  const clipped = clip('a very long sentence that keeps going and going', 20);
  assert.ok(clipped.length <= 20);
  assert.ok(clipped.endsWith('…'));
});

test('firstSentence: extracts the first sentence', () => {
  assert.equal(firstSentence('One. Two. Three.'), 'One.');
  assert.equal(firstSentence('No terminator here'), 'No terminator here');
});

// ── deck building ────────────────────────────────────────────────────────────

test('buildDeck: starts with a hook, ends with a recap, includes each kind', () => {
  const n = note('a');
  const deck = buildDeck(n, ctxOf([n, note('b'), note('c'), note('d')]));
  assert.equal(deck[0].type, 'hook');
  assert.equal(deck[deck.length - 1].type, 'recap');
  for (const kind of ['teach', 'insight', 'flash', 'quiz', 'podcast']) {
    assert.ok(deck.some((c) => c.type === kind), `deck should include a ${kind} card`);
  }
  // _i indices are stable and sequential
  assert.deepEqual(deck.map((c) => c._i), deck.map((_, i) => i));
});

test('buildDeck: quiz answers are always among the options', () => {
  const notes = ['a', 'b', 'c', 'd', 'e'].map((id) => note(id));
  const deck = buildDeck(notes[0], ctxOf(notes));
  for (const card of deck) {
    if (card.type === 'quiz') assert.ok(card.options.includes(card.answer));
  }
});

test('filterDeck: keeps only the requested card kinds plus hook/recap', () => {
  const n = note('a');
  const deck = buildDeck(n, ctxOf([n, note('b'), note('c'), note('d')]));
  const quizOnly = filterDeck(deck, 'quiz');
  assert.ok(quizOnly.every((c) => ['hook', 'quiz', 'recap'].includes(c.type)));
  assert.equal(filterDeck(deck, 'all'), deck);
  // unknown modes fall back to the full deck rather than an empty session
  assert.equal(filterDeck(deck, 'nonsense'), deck);
});

// ── plan building ────────────────────────────────────────────────────────────

test('buildPlan: node scope pulls in prerequisites, deepest first', () => {
  // Link semantics: a note that links to X is background for X — i.e. a
  // prerequisite of X (see quizCards' prereq question). So b→a makes b a
  // prerequisite of a, and c→b makes c the deepest prerequisite.
  const a = note('a');
  const b = note('b', { links: ['a'] });
  const c = note('c', { links: ['b'] });
  const plan = buildPlan({ scope: 'node', nodeId: 'a', notes: [a, b, c] });
  assert.deepEqual([...plan].sort(), ['a', 'b', 'c'], 'prereq chain is pulled in');
  assert.ok(plan.indexOf('c') < plan.indexOf('b'), 'deepest prerequisite first');
  assert.ok(plan.indexOf('b') < plan.indexOf('a'), 'target node last');
});

test('buildPlan: category scope selects only that category', () => {
  const a = note('a', { category: 'x' });
  const b = note('b', { category: 'y' });
  const plan = buildPlan({ scope: 'category', category: 'x', includePrereqs: false, notes: [a, b] });
  assert.deepEqual(plan, ['a']);
});

test('buildPlan: everything scope covers the vault exactly once', () => {
  const notes = ['a', 'b', 'c'].map((id) => note(id));
  const plan = buildPlan({ scope: 'everything', notes });
  assert.equal(plan.length, 3);
  assert.equal(new Set(plan).size, 3);
});

test('buildPlan: cyclic links do not hang or drop nodes', () => {
  const a = note('a', { links: ['b'] });
  const b = note('b', { links: ['a'] });
  const plan = buildPlan({ scope: 'everything', notes: [a, b] });
  assert.equal(new Set(plan).size, 2);
});

// ── estimation & podcast program ─────────────────────────────────────────────

test('estimateCards: scales with the number of plan nodes', () => {
  const notes = ['a', 'b', 'c'].map((id) => note(id));
  const one = estimateCards(['a'], notes);
  const three = estimateCards(['a', 'b', 'c'], notes);
  assert.ok(one > 0);
  assert.ok(three > one * 2);
  assert.equal(estimateCards(['missing'], notes), 0);
});

test('buildPodcastProgram: interleaves talk segments with checks', () => {
  const n = note('a');
  const program = buildPodcastProgram(n, ctxOf([n, note('b'), note('c'), note('d')]));
  assert.equal(program.title, n.title);
  assert.ok(program.segments.some((s) => s.type === 'talk'));
  assert.ok(program.segments.some((s) => s.type === 'flash' || s.type === 'quiz'));
  assert.ok(program.takeaways.length > 0);
});
