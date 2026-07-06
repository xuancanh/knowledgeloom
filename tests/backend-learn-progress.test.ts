/**
 * BDD-style tests for the learn-progress module:
 *  - sanitizeAiDeck / parseAiJson — the trust boundary for AI-generated decks
 *  - applyDayRollover — streak and daily-XP display rollover
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAiDeck, parseAiJson } from '../server/src/learn-progress/deck-sanitizer';
import { applyDayRollover } from '../server/src/learn-progress/progress-rollover';

// ── parseAiJson ───────────────────────────────────────────────────────────────

test('parseAiJson: parses a bare JSON object', () => {
  assert.deepEqual(parseAiJson('{"a":1}'), { a: 1 });
});

test('parseAiJson: extracts JSON from a ```json fence', () => {
  assert.deepEqual(parseAiJson('Here you go:\n```json\n{"a":1}\n```'), { a: 1 });
});

test('parseAiJson: recovers when the model prepends prose', () => {
  assert.deepEqual(parseAiJson('Sure! {"a":1}'), { a: 1 });
});

test('parseAiJson: throws when there is no JSON at all', () => {
  assert.throws(() => parseAiJson('no json here'));
});

// ── sanitizeAiDeck ────────────────────────────────────────────────────────────

const validDeck = {
  teach: [{ head: 'Core idea', paras: ['First paragraph.'] }],
  insight: { text: 'One memorable line.' },
  flash: [{ front: 'Q?', back: 'A.' }],
  quiz: [{ prompt: 'Pick one', options: ['right', 'wrong'], answer: 'right', feedback: 'because' }],
  podcast: { lines: [{ who: 'maya', text: 'Hello.' }, { who: 'theo', text: 'Hi.' }] },
  recap: { takeaways: ['Takeaway one.'] },
};

test('sanitizeAiDeck: passes a well-formed deck through', () => {
  const deck = sanitizeAiDeck(validDeck)!;
  assert.equal(deck.teach!.length, 1);
  assert.equal(deck.insight!.text, 'One memorable line.');
  assert.equal(deck.flash!.length, 1);
  assert.equal(deck.quiz!.length, 1);
  assert.equal(deck.podcast!.lines.length, 2);
  assert.deepEqual(deck.recap!.takeaways, ['Takeaway one.']);
});

test('sanitizeAiDeck: rejects non-objects', () => {
  assert.equal(sanitizeAiDeck(null), null);
  assert.equal(sanitizeAiDeck('deck'), null);
  assert.equal(sanitizeAiDeck([]), null);
});

test('sanitizeAiDeck: drops quiz items whose answer is not among the options', () => {
  const deck = sanitizeAiDeck({
    ...validDeck,
    quiz: [
      { prompt: 'bad', options: ['a', 'b'], answer: 'c', feedback: '' },
      { prompt: 'good', options: ['a', 'b'], answer: 'b', feedback: '' },
    ],
  })!;
  assert.equal(deck.quiz!.length, 1);
  assert.equal(deck.quiz![0].prompt, 'good');
});

test('sanitizeAiDeck: repairs a case-insensitive answer match to the verbatim option', () => {
  const deck = sanitizeAiDeck({
    ...validDeck,
    quiz: [{ prompt: 'p', options: ['Right Answer', 'other'], answer: 'right answer', feedback: '' }],
  })!;
  assert.equal(deck.quiz![0].answer, 'Right Answer');
});

test('sanitizeAiDeck: normalizes unknown podcast hosts to alternating maya/theo', () => {
  const deck = sanitizeAiDeck({
    ...validDeck,
    podcast: { lines: [{ who: 'alex', text: 'One.' }, { who: 'sam', text: 'Two.' }] },
  })!;
  assert.deepEqual(deck.podcast!.lines.map(l => l.who), ['maya', 'theo']);
});

test('sanitizeAiDeck: drops a podcast with fewer than two usable lines', () => {
  const deck = sanitizeAiDeck({
    ...validDeck,
    podcast: { lines: [{ who: 'maya', text: 'Solo.' }] },
  })!;
  assert.equal(deck.podcast, undefined);
});

test('sanitizeAiDeck: drops malformed teach/flash entries but keeps valid ones', () => {
  const deck = sanitizeAiDeck({
    teach: [{ head: '', paras: ['x'] }, { head: 'ok', paras: ['y'] }],
    flash: [{ front: 'f' }, { front: 'f', back: 'b' }],
  })!;
  assert.equal(deck.teach!.length, 1);
  assert.equal(deck.flash!.length, 1);
});

test('sanitizeAiDeck: returns null when no learnable content survives', () => {
  assert.equal(sanitizeAiDeck({ insight: { text: 'only an insight' }, recap: { takeaways: ['t'] } }), null);
  assert.equal(sanitizeAiDeck({ teach: [{ head: 'h', paras: [] }] }), null);
});

// ── applyDayRollover ──────────────────────────────────────────────────────────

const TODAY = '2026-07-05';
const YESTERDAY = '2026-07-04';

test('rollover: same-day activity is reported unchanged', () => {
  const r = applyDayRollover({ todayXp: 42, streak: 5, lastActiveDate: TODAY }, TODAY, YESTERDAY);
  assert.deepEqual(r, { todayXp: 42, streak: 5 });
});

test('rollover: active yesterday — todayXp resets, streak survives', () => {
  const r = applyDayRollover({ todayXp: 42, streak: 5, lastActiveDate: YESTERDAY }, TODAY, YESTERDAY);
  assert.deepEqual(r, { todayXp: 0, streak: 5 });
});

test('rollover: missed a full day — streak breaks', () => {
  const r = applyDayRollover({ todayXp: 42, streak: 5, lastActiveDate: '2026-07-01' }, TODAY, YESTERDAY);
  assert.deepEqual(r, { todayXp: 0, streak: 0 });
});

test('rollover: never active — zeros', () => {
  const r = applyDayRollover({ todayXp: 0, streak: 0, lastActiveDate: null }, TODAY, YESTERDAY);
  assert.deepEqual(r, { todayXp: 0, streak: 0 });
});
