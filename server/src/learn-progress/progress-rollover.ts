/**
 * Pure day-rollover logic for learn progress. Kept decorator-free so it can be
 * unit-tested without NestJS DI (see tests/backend-learn-progress.test.ts).
 */

/**
 * Rolls stored progress forward to the current day for display.
 * todayXp only counts today; a streak survives overnight (the user can still
 * extend it) but is broken once a full day has been missed.
 */
export function applyDayRollover(
  row: { todayXp: number; streak: number; lastActiveDate: string | null },
  today: string,
  yesterday: string,
): { todayXp: number; streak: number } {
  if (row.lastActiveDate === today) return { todayXp: row.todayXp, streak: row.streak };
  return {
    todayXp: 0,
    streak: row.lastActiveDate === yesterday ? row.streak : 0,
  };
}
