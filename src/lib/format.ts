/**
 * Formats a job timestamp for the activity page with relative day labels.
 *
 * Returns "Today HH:MM", "Yesterday HH:MM", or "Mon DD HH:MM" for older dates.
 * Returns "—" for null, undefined, or empty input.
 */
export function formatJobDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400000);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d >= todayStart) return `Today ${hhmm}`;
  if (d >= yesterdayStart) return `Yesterday ${hhmm}`;
  return `${d.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${hhmm}`;
}

/**
 * Formats a Date into a local datetime string for `<input type="datetime-local">`.
 *
 * Strips the timezone offset so the browser interprets the value as wall-clock
 * time. Returns a string like `"2026-01-15T14:30"` (YYYY-MM-DDTHH:MM).
 */
export function toLocalDateTimeInputValue(date: Date) {
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}
