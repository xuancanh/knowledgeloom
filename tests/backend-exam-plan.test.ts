/**
 * Exam-plan builder unit tests (pure module — server/src/study/exam-plan.ts).
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExamPlan, weaknessOrder, type ExamItem } from '../server/src/study/exam-plan';

function makeItems(n: number): ExamItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `card-${i}`,
    type: i % 2 ? ('quiz' as const) : ('flashcard' as const),
    noteId: `note-${i % 5}`,
    stability: i % 3 === 0 ? null : i,
    lapses: i % 4,
  }));
}

test('two-week runway: learn pass covers every item once, then consolidation, then final review', () => {
  const items = makeItems(40);
  const plan = buildExamPlan(items, '2026-07-20', '2026-07-06');

  assert.equal(plan.daysUntilExam, 14);
  assert.equal(plan.days[plan.days.length - 1].focus, 'exam');
  assert.equal(plan.days[plan.days.length - 2].focus, 'final-review');
  assert.equal(plan.days[plan.days.length - 2].date, '2026-07-19');

  const learnDays = plan.days.filter((d) => d.focus === 'learn');
  const consolidateDays = plan.days.filter((d) => d.focus === 'consolidate');
  assert.ok(learnDays.length > consolidateDays.length, 'learning gets the larger share');

  // Every item appears exactly once in each pass.
  const learnIds = learnDays.flatMap((d) => d.items.map((i) => i.id)).sort();
  assert.deepEqual(learnIds, items.map((i) => i.id).sort());
  const consolidateIds = consolidateDays.flatMap((d) => d.items.map((i) => i.id)).sort();
  assert.deepEqual(consolidateIds, items.map((i) => i.id).sort());

  // Load is even within a pass (round-robin): bucket sizes differ by at most 1.
  const sizes = learnDays.map((d) => d.items.length);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
});

test('plan dates are consecutive from today through exam day', () => {
  const plan = buildExamPlan(makeItems(10), '2026-07-13', '2026-07-06');
  const dates = plan.days.map((d) => d.date);
  assert.equal(dates[0], '2026-07-06');
  assert.equal(dates[dates.length - 1], '2026-07-13');
  for (let i = 1; i < dates.length; i++) {
    assert.equal(Date.parse(dates[i]) - Date.parse(dates[i - 1]), 86_400_000, `gap at ${dates[i]}`);
  }
});

test('one-day runway: everything crammed today, weakest first', () => {
  const items = makeItems(9);
  const plan = buildExamPlan(items, '2026-07-07', '2026-07-06');
  assert.equal(plan.days.length, 2);
  assert.equal(plan.days[0].focus, 'final-review');
  assert.equal(plan.days[0].items.length, 9, 'every item reviewed on the only day available');
  // never-studied items (stability null) come first
  assert.equal(plan.days[0].items[0].id, weaknessOrder(items)[0].id);
});

test('exam today: single sweep capped at the weakest items', () => {
  const plan = buildExamPlan(makeItems(100), '2026-07-06', '2026-07-06');
  assert.equal(plan.daysUntilExam, 0);
  assert.equal(plan.days.length, 1);
  assert.equal(plan.days[0].focus, 'exam');
  assert.ok(plan.days[0].items.length <= 60, 'final sweep is capped');
});

test('weaknessOrder: unknown stability first, then ascending stability, lapses break ties', () => {
  const ordered = weaknessOrder([
    { id: 'strong', type: 'flashcard', noteId: 'n', stability: 50, lapses: 0 },
    { id: 'new', type: 'flashcard', noteId: 'n', stability: null, lapses: 0 },
    { id: 'weak', type: 'flashcard', noteId: 'n', stability: 2, lapses: 0 },
    { id: 'lapsy', type: 'flashcard', noteId: 'n', stability: 2, lapses: 5 },
  ]);
  assert.deepEqual(ordered.map((i) => i.id), ['new', 'lapsy', 'weak', 'strong']);
});

test('totals add up', () => {
  const plan = buildExamPlan(makeItems(20), '2026-07-16', '2026-07-06');
  assert.equal(plan.totalItems, 20);
  assert.equal(plan.totalReviews, plan.days.reduce((n, d) => n + d.items.length, 0));
  assert.ok(plan.totalReviews >= 40, 'at least two passes over the material');
});
