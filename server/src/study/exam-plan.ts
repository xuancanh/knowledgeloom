/**
 * Exam-mode plan builder — pure and decorator-free (unit-tested with tsx).
 *
 * Given the study items in scope and an exam date, lays out a day-by-day
 * schedule that front-loads learning and compresses review toward the exam:
 *
 *   learning pass      first ~60% of days — every item once, evenly spread
 *   consolidation pass remaining days     — every item again, evenly spread
 *   final review       last day before/of the exam — the weakest items
 *
 * With little runway the passes collapse: 1 day = cram everything once,
 * 2 days = one pass + final review. Daily load is whatever the passes
 * produce — the point of the plan is showing the true cost per day.
 */

export interface ExamItem {
  id: string;
  type: 'flashcard' | 'quiz';
  noteId: string;
  noteTitle?: string;
  /** FSRS stability if known — weaker items get priority in the final sweep. */
  stability?: number | null;
  lapses?: number;
}

export interface ExamPlanDay {
  date: string; // YYYY-MM-DD
  focus: 'learn' | 'consolidate' | 'final-review' | 'exam';
  items: { id: string; type: 'flashcard' | 'quiz'; noteId: string }[];
}

export interface ExamPlan {
  examDate: string;
  daysUntilExam: number;
  totalItems: number;
  totalReviews: number;
  days: ExamPlanDay[];
}

const FINAL_REVIEW_CAP = 60;

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/** Spreads items across `dayCount` buckets, round-robin so load stays even. */
function distribute<T>(items: T[], dayCount: number): T[][] {
  const buckets: T[][] = Array.from({ length: Math.max(1, dayCount) }, () => []);
  items.forEach((item, i) => buckets[i % buckets.length].push(item));
  return buckets;
}

/** Weakest first: unknown stability (never studied) → lowest, then by stability, lapses break ties. */
export function weaknessOrder(items: ExamItem[]): ExamItem[] {
  return [...items].sort((a, b) => {
    const sa = a.stability ?? -1;
    const sb = b.stability ?? -1;
    if (sa !== sb) return sa - sb;
    return (b.lapses ?? 0) - (a.lapses ?? 0);
  });
}

export function buildExamPlan(items: ExamItem[], examDate: string, todayIso?: string): ExamPlan {
  const today = todayIso ?? isoDay(new Date());
  const msPerDay = 86_400_000;
  const daysUntilExam = Math.max(
    0,
    Math.round((Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / msPerDay),
  );

  const slim = (list: ExamItem[]) => list.map(({ id, type, noteId }) => ({ id, type, noteId }));
  const days: ExamPlanDay[] = [];
  const weakest = weaknessOrder(items).slice(0, FINAL_REVIEW_CAP);

  // Study days run from today until the day before the exam.
  const studyDays = daysUntilExam;

  if (studyDays <= 0) {
    // Exam is today: one final sweep.
    days.push({ date: today, focus: 'exam', items: slim(weakest) });
  } else if (studyDays === 1) {
    days.push({ date: today, focus: 'final-review', items: slim(weaknessOrder(items)) });
    days.push({ date: examDate, focus: 'exam', items: [] });
  } else {
    const finalDay = addDays(examDate, -1);
    const passDays = studyDays - 1; // everything before the final-review day
    const learnDays = Math.max(1, Math.round(passDays * 0.6));
    const consolidateDays = Math.max(0, passDays - learnDays);

    const learnBuckets = distribute(items, learnDays);
    for (let i = 0; i < learnDays; i++) {
      days.push({ date: addDays(today, i), focus: 'learn', items: slim(learnBuckets[i] ?? []) });
    }
    if (consolidateDays > 0) {
      const consolidateBuckets = distribute(items, consolidateDays);
      for (let i = 0; i < consolidateDays; i++) {
        days.push({ date: addDays(today, learnDays + i), focus: 'consolidate', items: slim(consolidateBuckets[i] ?? []) });
      }
    }
    days.push({ date: finalDay, focus: 'final-review', items: slim(weakest) });
    days.push({ date: examDate, focus: 'exam', items: [] });
  }

  return {
    examDate,
    daysUntilExam,
    totalItems: items.length,
    totalReviews: days.reduce((n, d) => n + d.items.length, 0),
    days,
  };
}
