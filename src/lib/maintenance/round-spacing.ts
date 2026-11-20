// src/lib/maintenance/round-spacing.ts
// One round at a time (LIMSL, 20 Nov 2026). Two open visits of the same kind on
// one machine closer together than half its interval are the same round
// entered twice. Pure, so the schedule route and the tests agree.

const INTERVAL_DAYS: Record<string, number> = {
  WEEKLY: 7,
  MONTHLY: 30,
  BI_MONTHLY: 61,
  QUARTERLY: 91,
  SEMI_ANNUAL: 182,
  ANNUAL: 365,
};

const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 864e5;

/** The open date the new one clashes with, or null. A one-off (no known interval) never clashes. */
export function tooCloseTo(newDate: string, openDates: string[], frequency: string | null | undefined): string | null {
  const interval = INTERVAL_DAYS[(frequency ?? "").toUpperCase().trim()];
  if (!interval) return null;
  const limit = interval / 2;
  return openDates.find((d) => Math.abs(dayNumber(d) - dayNumber(newDate)) < limit) ?? null;
}
