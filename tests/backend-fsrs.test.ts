/**
 * FSRS-4.5 scheduler unit tests — imports the real implementation
 * (server/src/scheduling/fsrs.ts is decorator-free, so tsx can load it).
 *
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fsrsReview,
  retrievability,
  nextIntervalDays,
  seedFromLegacy,
  elapsedDaysBetween,
  DESIRED_RETENTION,
  type FsrsState,
} from '../server/src/scheduling/fsrs';

test('new card: good gets a multi-day interval, again gets 1 day', () => {
  const good = fsrsReview(null, 3, 0);
  assert.ok(good.intervalDays >= 3, `good interval ${good.intervalDays} should be days, not hours`);
  assert.equal(good.state.reps, 1);
  assert.equal(good.state.lapses, 0);

  const again = fsrsReview(null, 1, 0);
  assert.equal(again.intervalDays, 1);
  assert.equal(again.state.lapses, 1);
});

test('successive good reviews grow the interval (the SM-2 bug regression)', () => {
  // The old endpoint never loaded prior state, so intervals were stuck at the
  // first-review value forever. FSRS must grow: I1 < I2 < I3.
  let state: FsrsState | null = null;
  const intervals: number[] = [];
  for (let i = 0; i < 3; i++) {
    const out = fsrsReview(state, 3, state ? intervals[intervals.length - 1] : 0);
    intervals.push(out.intervalDays);
    state = out.state;
  }
  assert.ok(intervals[1] > intervals[0], `I2 ${intervals[1]} > I1 ${intervals[0]}`);
  assert.ok(intervals[2] > intervals[1], `I3 ${intervals[2]} > I2 ${intervals[1]}`);
});

test('again after a long run resets to 1 day and reduces stability', () => {
  let state: FsrsState | null = null;
  let interval = 0;
  for (let i = 0; i < 4; i++) {
    const out = fsrsReview(state, 3, interval);
    state = out.state;
    interval = out.intervalDays;
  }
  const beforeLapse = state!.stability;
  const lapsed = fsrsReview(state, 1, interval);
  assert.equal(lapsed.intervalDays, 1);
  assert.ok(lapsed.state.stability < beforeLapse, 'lapse must shrink stability');
  assert.equal(lapsed.state.lapses, 1);
});

test('hard grows slower than good; difficulty rises on hard, falls on good', () => {
  const base = fsrsReview(null, 3, 0).state;
  const afterHard = fsrsReview(base, 2, 5);
  const afterGood = fsrsReview(base, 3, 5);
  assert.ok(afterHard.intervalDays <= afterGood.intervalDays);
  assert.ok(afterHard.state.difficulty > afterGood.state.difficulty);
});

test('retrievability: 1 at t=0, ~desired retention when t = interval', () => {
  assert.equal(retrievability(0, 10), 1);
  const s = 20;
  const interval = nextIntervalDays(s);
  const r = retrievability(interval, s);
  assert.ok(Math.abs(r - DESIRED_RETENTION) < 0.03, `R(${interval}, ${s}) = ${r} ≈ ${DESIRED_RETENTION}`);
});

test('difficulty stays clamped to [1, 10] under extreme sequences', () => {
  let state: FsrsState | null = null;
  for (let i = 0; i < 30; i++) {
    state = fsrsReview(state, 1, 1).state; // repeated failure
    assert.ok(state.difficulty >= 1 && state.difficulty <= 10);
    assert.ok(state.stability >= 0.1);
  }
  for (let i = 0; i < 30; i++) {
    state = fsrsReview(state, 4, 1).state; // repeated easy
    assert.ok(state.difficulty >= 1 && state.difficulty <= 10);
  }
});

test('interval is capped at one year', () => {
  const out = fsrsReview({ stability: 10_000, difficulty: 2, reps: 50, lapses: 0 }, 4, 400);
  assert.ok(out.intervalDays <= 365);
});

test('legacy SM-2 rows seed FSRS state from interval and ease', () => {
  const seeded = seedFromLegacy(12, 2.5, 4);
  assert.ok(seeded);
  assert.equal(seeded!.stability, 12, 'old interval carries over as stability');
  assert.ok(seeded!.difficulty >= 1 && seeded!.difficulty <= 10);
  assert.equal(seeded!.reps, 4);

  assert.equal(seedFromLegacy(0, 2.5, 0), null, 'empty rows mean a new card');
});

test('elapsedDaysBetween: null-safe and floored at zero', () => {
  assert.equal(elapsedDaysBetween(null), 0);
  assert.equal(elapsedDaysBetween('not-a-date'), 0);
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
  const d = elapsedDaysBetween(twoDaysAgo);
  assert.ok(Math.abs(d - 2) < 0.01);
  const future = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(elapsedDaysBetween(future), 0);
});
