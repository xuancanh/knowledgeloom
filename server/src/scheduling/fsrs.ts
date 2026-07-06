/**
 * FSRS-4.5 spaced-repetition scheduler (default parameters, no per-user
 * optimisation yet). Pure and decorator-free so tests can import it with tsx.
 *
 * Model: each card carries a memory state (stability S in days, difficulty D
 * in [1,10]). Retrievability decays as R(t) = (1 + F·t/S)^C. After a review
 * the state is updated from the rating and the next interval is chosen so
 * retrievability at review time equals DESIRED_RETENTION.
 *
 * The app exposes three flashcard ratings; they map onto FSRS grades as
 * again=1, hard=2, good=3 (quiz: wrong=1, correct=3). Grade 4 (easy) is
 * supported for future UI use.
 *
 * Legacy rows (SM-2, pre-FSRS) have no stability/difficulty; seedFromLegacy
 * converts their interval into an initial state so accumulated history is not
 * thrown away.
 */

export type FsrsGrade = 1 | 2 | 3 | 4;

export interface FsrsState {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
}

export interface FsrsOutcome {
  state: FsrsState;
  /** Next interval in whole days (>= 1). */
  intervalDays: number;
  nextReviewAt: string;
}

/** FSRS-4.5 default weights. */
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
];

const DECAY = -0.5;
const FACTOR = 19 / 81; // chosen so R(S) = 0.9
export const DESIRED_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 365;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Probability of recall after elapsedDays with stability S. */
export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / Math.max(0.1, stability), DECAY);
}

/** Interval (days) at which retrievability decays to the desired retention. */
export function nextIntervalDays(stability: number, retention = DESIRED_RETENTION): number {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL_DAYS);
}

function initDifficulty(grade: FsrsGrade): number {
  return clamp(W[4] - Math.exp(W[5] * (grade - 1)) + 1, 1, 10);
}

function initStability(grade: FsrsGrade): number {
  return Math.max(0.1, W[grade - 1]);
}

function nextDifficulty(d: number, grade: FsrsGrade): number {
  const updated = d - W[6] * (grade - 3);
  // Mean reversion toward the difficulty of a hypothetical "easy" first rating.
  return clamp(W[7] * initDifficulty(4) + (1 - W[7]) * updated, 1, 10);
}

function stabilityAfterSuccess(s: number, d: number, r: number, grade: FsrsGrade): number {
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  const growth = Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1);
  return s * (1 + growth * hardPenalty * easyBonus);
}

function stabilityAfterLapse(s: number, d: number, r: number): number {
  const next = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return clamp(next, 0.1, s); // forgetting can't increase stability
}

/**
 * Applies one review. `state` is null for a brand-new card; `elapsedDays` is
 * time since the previous review (0 for new cards or same-day reviews).
 */
export function fsrsReview(state: FsrsState | null, grade: FsrsGrade, elapsedDays: number, now = new Date()): FsrsOutcome {
  let next: FsrsState;

  if (!state || state.stability <= 0) {
    next = {
      stability: initStability(grade),
      difficulty: initDifficulty(grade),
      reps: 1,
      lapses: grade === 1 ? 1 : 0,
    };
  } else {
    const r = retrievability(elapsedDays, state.stability);
    const difficulty = nextDifficulty(state.difficulty, grade);
    const stability = grade === 1
      ? stabilityAfterLapse(state.stability, state.difficulty, r)
      : stabilityAfterSuccess(state.stability, state.difficulty, r, grade);
    next = {
      stability: Math.max(0.1, stability),
      difficulty,
      reps: state.reps + 1,
      lapses: state.lapses + (grade === 1 ? 1 : 0),
    };
  }

  const intervalDays = grade === 1 ? 1 : nextIntervalDays(next.stability);
  const nextReview = new Date(now.getTime() + intervalDays * 86_400_000);
  return { state: next, intervalDays, nextReviewAt: nextReview.toISOString() };
}

/**
 * Builds an FSRS state from a legacy SM-2 row so existing review history
 * carries over: the old interval approximates stability (at 90% retention the
 * FSRS interval ≈ stability), and ease maps linearly onto difficulty.
 */
export function seedFromLegacy(intervalDays: number, easeFactor: number, repetitions: number): FsrsState | null {
  if (!intervalDays && !repetitions) return null;
  const difficulty = clamp(11 - 3 * (easeFactor || 2.5), 1, 10);
  return {
    stability: Math.max(0.1, intervalDays || 0.5),
    difficulty,
    reps: repetitions || 1,
    lapses: 0,
  };
}

/** Whole days between two ISO timestamps, floored at 0. */
export function elapsedDaysBetween(fromIso: string | null | undefined, to = new Date()): number {
  if (!fromIso) return 0;
  const from = Date.parse(fromIso);
  if (Number.isNaN(from)) return 0;
  return Math.max(0, (to.getTime() - from) / 86_400_000);
}
