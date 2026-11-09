// src/lib/maintenance/working-days.ts
// No preventive maintenance on a Saturday or a Sunday.
//
// The plan is counted from each category's start date, and counting by months
// lands wherever the calendar puts it, a weekend included. Nobody is on the
// floor to do that work, so a weekend date is a PM that starts life overdue.
// A weekend date therefore moves FORWARD to the next working day; the interval
// is still counted from the start date, so one weekend never drags the rest of
// the year with it.
//
// Moving forward can land on a day another category already owns, and the plan
// promises no two categories share a day. So a shifted date also skips days in
// `taken`. Pure, string-in/string-out on YYYY-MM-DD, so the same rule runs in
// the browser (the collision warning while a change is drafted) and on the
// server (writing the plan), and cannot drift between them.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const toUtc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, n: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

/** Saturday or Sunday. Parsed as UTC so the answer never depends on the server's timezone. */
export function isWeekend(iso: string): boolean {
  if (!ISO.test(iso.slice(0, 10))) return false;
  const dow = toUtc(iso).getUTCDay();
  return dow === 0 || dow === 6;
}

const free = (iso: string, taken?: ReadonlySet<string>) => !isWeekend(iso) && !taken?.has(iso);

/**
 * The working day a PM due on `iso` is actually planned for.
 *
 * A weekday is returned as it is, even when `taken` holds it: a weekday clash
 * between two categories is a real collision for the collision check to refuse,
 * not something to paper over by quietly moving one of them.
 *
 * A weekend date walks forward to the first weekday not in `taken`. At the end
 * of December it walks BACK instead, to the last free weekday of the year: a
 * plan row for 2026 dated in 2027 would fall outside every query that reads the
 * 2026 plan, and the next sync would add the "missing" date again.
 */
export function toWorkingDay(iso: string, taken?: ReadonlySet<string>): string {
  const day = iso.slice(0, 10);
  if (!ISO.test(day) || !isWeekend(day)) return day;

  const year = day.slice(0, 4);
  for (let d = addDays(day, 1); d.slice(0, 4) === year; d = addDays(d, 1)) {
    if (free(d, taken)) return d;
  }
  for (let d = addDays(day, -1); d.slice(0, 4) === year; d = addDays(d, -1)) {
    if (free(d, taken)) return d;
  }
  return day;
}
