/**
 * BDD-style tests for pure business logic in FlashcardsService and QuizService
 * (normalization, AI JSON parsing, RAG helpers). Review scheduling moved to
 * FSRS — see tests/backend-fsrs.test.ts.
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ── Quiz normalization (banned prompts, valid types) ─────────────────────────

const BANNED_PROMPTS = new Set([
  'what i learned', 'key details', 'lesson', 'summary',
  'key idea', 'key takeaway', 'main concept', 'key insight', 'important note',
]);

const ALLOWED_KINDS = new Set(['concept', 'question', 'lesson', 'tradeoff', 'pattern']);

function isValidFlashcard(prompt: string, lesson: string, kind: string): boolean {
  if (prompt.length < 8) return false;
  if (lesson.length < 30) return false;
  if (BANNED_PROMPTS.has(prompt.toLowerCase().trim())) return false;
  if (!ALLOWED_KINDS.has(kind)) return false;
  return true;
}

test('flashcard normalization: rejects prompts shorter than 8 chars', () => {
  assert.ok(!isValidFlashcard('Short', 'This is a long enough lesson to pass the minimum', 'concept'));
});

test('flashcard normalization: rejects lessons shorter than 30 chars', () => {
  assert.ok(!isValidFlashcard('A valid prompt here', 'Too short', 'concept'));
});

test('flashcard normalization: rejects banned prompt phrases', () => {
  assert.ok(!isValidFlashcard('What I learned', 'This is a detailed enough lesson to pass the check', 'concept'));
  assert.ok(!isValidFlashcard('key details', 'This is a detailed enough lesson to pass the check', 'concept'));
  assert.ok(!isValidFlashcard('  Summary  ', 'This is a detailed enough lesson to pass the check', 'concept'));
});

test('flashcard normalization: rejects unknown kind values', () => {
  assert.ok(!isValidFlashcard('A good prompt question here', 'This is a detailed enough lesson to pass', 'essay'));
});

test('flashcard normalization: accepts valid flashcards', () => {
  assert.ok(isValidFlashcard(
    'What makes consistent hashing resilient?',
    'Consistent hashing minimizes key redistribution when nodes are added or removed.',
    'concept',
  ));
  assert.ok(isValidFlashcard(
    'When does optimistic locking beat pessimistic locking?',
    'Optimistic locking works well when conflicts are rare and transactions are short.',
    'tradeoff',
  ));
});

test('flashcard normalization: coerces unknown kind to lesson', () => {
  // Unknown kinds should be coerced to 'lesson' rather than rejected
  const kind = 'unknown-type';
  const resolved = ALLOWED_KINDS.has(kind) ? kind : 'lesson';
  assert.equal(resolved, 'lesson');
});

// ── AI JSON parsing ──────────────────────────────────────────────────────────

function parseAiJson(output: string): any[] {
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI did not return JSON');
  const parsed = JSON.parse(trimmed.slice(start, end + 1));
  if (!Array.isArray(parsed.flashcards) && !Array.isArray(parsed.questions)) {
    throw new Error('AI JSON is missing cards/questions array');
  }
  return parsed.flashcards || parsed.questions;
}

test('AI JSON parsing: extracts flashcards array from AI response', () => {
  const output = '```json\n{"flashcards": [{"prompt": "Q1", "lesson": "L1", "kind": "concept"}]}\n```';
  const result = parseAiJson(output);
  assert.equal(result.length, 1);
  assert.equal(result[0].prompt, 'Q1');
});

test('AI JSON parsing: strips markdown fences', () => {
  const output = '```\n{"flashcards": [{"prompt": "Q1", "lesson": "L1", "kind": "pattern"}]}```';
  const result = parseAiJson(output);
  assert.equal(result.length, 1);
});

test('AI JSON parsing: handles plain JSON without fences', () => {
  const output = '{"flashcards": [{"prompt": "Q1", "lesson": "L1", "kind": "concept"}]}';
  const result = parseAiJson(output);
  assert.equal(result.length, 1);
});

test('AI JSON parsing: throws when no JSON braces found', () => {
  assert.throws(() => parseAiJson('just some text'), /AI did not return/);
});

test('AI JSON parsing: throws when missing flashcards key', () => {
  assert.throws(
    () => parseAiJson('{"other": []}'),
    /missing cards/,
  );
});

test('AI JSON parsing: extracts questions array from quiz response', () => {
  const output = '{"questions": [{"type": "fill-blank", "question": "The ___ runs apps", "answer": "kernel"}]}';
  const result = parseAiJson(output);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'fill-blank');
});

// ── Context block building (RAG) ─────────────────────────────────────────────

const CONTEXT_CHAR_LIMIT = 16_000;
const MAX_CONTEXT_NOTES = 12;

function buildContextBlock(notes: Array<{ title: string; category: string; tags: string[]; summary: string }>): string {
  if (!notes.length) return 'No notes found for this scope.';

  let total = 0;
  const chunks: string[] = [];

  for (const note of notes) {
    const entry = `### ${note.title}\n**Category:** ${note.category}  **Tags:** ${note.tags.join(', ') || 'none'}\n${note.summary}`;
    if (total + entry.length > CONTEXT_CHAR_LIMIT) break;
    chunks.push(entry);
    total += entry.length;
  }

  return `## Retrieved notes (${chunks.length} of ${notes.length})\n\n${chunks.join('\n\n---\n\n')}`;
}

test('RAG context: returns fallback for empty notes', () => {
  const result = buildContextBlock([]);
  assert.equal(result, 'No notes found for this scope.');
});

test('RAG context: builds context block for one note', () => {
  const result = buildContextBlock([
    { title: 'Test Note', category: 'Engineering', tags: ['go'], summary: 'A short summary.' },
  ]);
  assert.ok(result.includes('### Test Note'));
  assert.ok(result.includes('**Category:** Engineering'));
  assert.ok(result.includes('go'));
  assert.ok(result.includes('Retrieved notes (1 of 1)'));
});

test('RAG context: includes all notes that fit within char limit', () => {
  const notes = Array.from({ length: 20 }, (_, i) => ({
    title: `Note ${i}`,
    category: 'General',
    tags: [],
    summary: `Summary for note ${i}.`,
  }));
  const result = buildContextBlock(notes);
  // All summaries are short, so all fit. But caller caps at MAX_CONTEXT_NOTES.
  assert.ok(result.includes('(20 of 20)'));

  // With fewer notes
  const few = buildContextBlock(notes.slice(0, 5));
  assert.ok(few.includes('(5 of 5)'));
});

test('RAG context: truncates when char limit exceeded', () => {
  const notes = [
    { title: 'Big Note', category: 'General', tags: [], summary: 'A'.repeat(CONTEXT_CHAR_LIMIT - 100) },
    { title: 'Second Note', category: 'General', tags: [], summary: 'Should not appear' },
  ];
  const result = buildContextBlock(notes);
  assert.ok(result.includes('Big Note'));
  assert.ok(!result.includes('Second Note'));
});

// ── Keyword relevance ranking ────────────────────────────────────────────────

function rankByRelevance(notes: Array<{ title: string; summary: string; tags: string[]; id: string }>, query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = notes.map((n) => {
    const haystack = `${n.title} ${n.summary} ${n.tags.join(' ')}`.toLowerCase();
    const score = words.reduce((s, w) => s + (haystack.includes(w) ? 1 : 0), 0);
    return { id: n.id, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CONTEXT_NOTES)
    .map((s) => s.id);
}

test('relevance ranking: scores notes by keyword matches', () => {
  const notes = [
    { id: 'n1', title: 'React Hooks', summary: 'Using hooks in React', tags: ['react', 'hooks'] },
    { id: 'n2', title: 'CSS Grid', summary: 'Layout with grid', tags: ['css'] },
    { id: 'n3', title: 'React Performance', summary: 'Optimizing react apps', tags: ['react', 'perf'] },
  ];

  const result = rankByRelevance(notes, 'react performance');
  // n3 should score highest (react in title + summary, perf in summary, react in tags)
  assert.equal(result[0], 'n3');
});

test('relevance ranking: scores zero when no keywords match', () => {
  const notes = [
    { id: 'n1', title: 'CSS Grid', summary: 'Layout with grid', tags: ['css'] },
    { id: 'n2', title: 'Docker Basics', summary: 'Containerization', tags: ['docker'] },
  ];

  const result = rankByRelevance(notes, 'react hooks');
  // All score 0 — stable sort preserves original order
  assert.equal(result.length, 2);
});

test('relevance ranking: caps at MAX_CONTEXT_NOTES', () => {
  const notes = Array.from({ length: MAX_CONTEXT_NOTES + 5 }, (_, i) => ({
    id: `n${i}`,
    title: `Note ${i}`,
    summary: `Summary ${i}`,
    tags: ['tag'],
  }));

  const result = rankByRelevance(notes, 'note');
  assert.equal(result.length, MAX_CONTEXT_NOTES);
});

// ── Stable generated-content ids (compiled services) ─────────────────────────
//
// Review progress (SM-2 / quiz streaks) is keyed by card id, so ids must be
// deterministic across regenerations. These tests exercise the real compiled
// normalize() from server/dist; they skip when the server hasn't been built.

import { existsSync as _existsSync } from 'node:fs';
import { join as _join, dirname as _dirname } from 'node:path';
import { fileURLToPath as _fileURLToPath } from 'node:url';

const _DIST = _join(_dirname(_fileURLToPath(import.meta.url)), '../server/dist');
const _hasDist = _existsSync(_join(_DIST, 'flashcards/flashcards.service.js'));
const distTest = (name: string, fn: () => void | Promise<void>) =>
  test(name, { skip: _hasDist ? false : 'needs server/dist build' }, fn);

const _note = { id: 'note-1', title: 'T', category: 'C', summary: 'S', tags: [] };

distTest('flashcards: identical prompts produce identical ids across regenerations', async () => {
  const { FlashcardsService } = await import(_join(_DIST, 'flashcards/flashcards.service.js'));
  const svc: any = new FlashcardsService(null, null, null, null, null, null);
  const cards = [{ prompt: 'What makes hashing consistent?', lesson: 'A ring topology keeps key movement proportional to node churn.', kind: 'concept' }];
  const a = svc.normalize(_note, cards);
  const b = svc.normalize(_note, cards);
  assert.equal(a[0].id, b[0].id);
  assert.ok(a[0].id.startsWith('note-1-'));
});

distTest('flashcards: duplicate prompts within one batch get distinct suffixed ids', async () => {
  const { FlashcardsService } = await import(_join(_DIST, 'flashcards/flashcards.service.js'));
  const svc: any = new FlashcardsService(null, null, null, null, null, null);
  const card = { prompt: 'What makes hashing consistent?', lesson: 'A ring topology keeps key movement proportional to node churn.', kind: 'concept' };
  const out = svc.normalize(_note, [card, { ...card }]);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].id, out[1].id);
  assert.equal(out[1].id, `${out[0].id}-2`);
});

distTest('quiz: identical questions produce identical ids across regenerations', async () => {
  const { QuizService } = await import(_join(_DIST, 'quiz/quiz.service.js'));
  const svc: any = new QuizService(null, null, null, null, null);
  const qs = [{ type: 'short-answer', question: 'Explain CAP.', answer: 'A distributed system can only guarantee two of consistency, availability, partition tolerance.' }];
  const a = svc.normalize(_note, qs);
  const b = svc.normalize(_note, qs);
  assert.equal(a[0].id, b[0].id);
  assert.ok(a[0].id.startsWith('quiz-note-1-'));
});
