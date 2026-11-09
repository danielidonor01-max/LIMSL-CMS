// src/lib/maintenance/plan-generation.ts
// Putting a machine onto the annual plan the moment it joins the register.
//
// A machine added in March with a quarterly interval was, until now, simply
// absent from the plan: somebody had to remember to add it by hand, and the
// first sign that nobody had was the machine failing. The register already
// records the interval, so the plan can be derived from it, and a new machine —
// or a whole new category, an excavation device nobody had before — appears on
// the calendar without anybody being asked to remember.
//
// This is pure. It decides dates and nothing else, so the arithmetic can be
// tested without a database, and so the same rule produces the plan whether a
// machine arrives one at a time or a hundred are imported at once.

import { isWeekend, toWorkingDay } from "./working-days";

/** Months between services, by the interval the register records. */
export const FREQUENCY_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  BI_MONTHLY: 2,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  ANNUAL: 12,
};

// Labels live in constants.ts (FREQUENCY_LABELS) with the rest of the
// register's vocabulary. This file only decides which intervals the planner
// can actually schedule — FREQUENCY_MONTHS — so an interval offered in a form
// is always one that produces a plan.

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Days in a month, so a 31st never silently becomes the 1st of the next. */
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export type PlannedActivity = {
  plannedDate: string;
  month: number;
  quarter: number;
  activityType: "PM";
};

/** The anchor's month and day, or January 1st when the register has none. */
function anchorParts(anchorDate?: string | null) {
  const anchor = (anchorDate ?? "").slice(0, 10);
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(anchor);
  return { day: ok ? Number(anchor.slice(8, 10)) : 1, month: ok ? Number(anchor.slice(5, 7)) : 1 };
}

/**
 * The dates the interval itself lands on, before the weekend rule. Exported for
 * the category calendar, which has to know which dates were weekdays to begin
 * with before it can decide where the weekend ones go.
 */
export function rawPlannedDates(input: {
  frequency?: string | null;
  anchorDate?: string | null;
  year: number;
}): string[] {
  const months = FREQUENCY_MONTHS[String(input.frequency ?? "").toUpperCase()];
  // No interval recorded is not "monthly by default" — it is a machine nobody
  // has decided about, and inventing a schedule for it would be inventing work.
  if (!months) return [];

  const anchor = anchorParts(input.anchorDate);
  const out: string[] = [];
  // Walk the year in steps of the interval, starting from the anchor month
  // brought forward into this year.
  for (let month = ((anchor.month - 1) % months) + 1; month <= 12; month += months) {
    out.push(iso(input.year, month, Math.min(anchor.day, daysIn(input.year, month))));
  }
  return out;
}

const activity = (plannedDate: string): PlannedActivity => {
  const month = Number(plannedDate.slice(5, 7));
  return { plannedDate, month, quarter: Math.floor((month - 1) / 3) + 1, activityType: "PM" };
};

/**
 * The dates a machine is due in a given year.
 *
 * Counting runs from the machine's anchor — when it was commissioned, or when
 * it was last serviced — so a quarterly machine commissioned in February falls
 * due in February, May, August and November rather than being swept onto a
 * calendar quarter it has nothing to do with. Two machines of the same category
 * bought six months apart are genuinely due at different times, and pretending
 * otherwise is how a plan stops describing the factory.
 *
 * A date that lands on a weekend moves to the next working day not in `taken`
 * (see working-days.ts). Month and quarter follow the date it moved TO, because
 * that is the date the work is actually planned for.
 */
export function plannedDatesFor(input: {
  frequency?: string | null;
  /** Commissioning date, or last maintenance, whichever the register knows. */
  anchorDate?: string | null;
  year: number;
  /** Nothing is planned before this, so adding a machine today does not
   *  back-date work nobody could have done. */
  notBefore?: string | null;
  /** Days a weekend date may not move onto — another category's PM days. */
  taken?: ReadonlySet<string>;
}): PlannedActivity[] {
  const notBefore = input.notBefore ? input.notBefore.slice(0, 10) : null;
  return rawPlannedDates(input)
    .map((d) => toWorkingDay(d, input.taken))
    .filter((d) => !notBefore || d >= notBefore)
    .map(activity);
}

// ─── The category calendar ──────────────────────────────────────────────────

export type CalendarCategory = {
  code: string;
  maintenanceFrequency: string | null;
  defaultStartDate: string | null;
};

export type CategoryCalendar = {
  /** Each category's PM days for the year, after the weekend rule. */
  dates: Map<string, string[]>;
  /** Weekdays two categories both land on before anything moved. */
  clashes: { date: string; codes: string[] }[];
};

/**
 * Every category's PM days for a year, with weekend dates moved so they never
 * land on another category's day.
 *
 * Weekday dates are fixed first, because nothing moved them and they are what
 * the plan already says. Weekend dates then take the next free working day, in
 * date order and then by category code, so the same categories always resolve
 * to the same calendar no matter which screen or route computes it.
 */
export function categoryCalendar(categories: CalendarCategory[], year: number): CategoryCalendar {
  const owner = new Map<string, string>();
  const clashMap = new Map<string, Set<string>>();
  const weekend: { code: string; raw: string }[] = [];
  const dates = new Map<string, string[]>();

  for (const c of categories) {
    if (!c.defaultStartDate) continue;
    dates.set(c.code, []);
    for (const raw of rawPlannedDates({ frequency: c.maintenanceFrequency, anchorDate: c.defaultStartDate, year })) {
      if (isWeekend(raw)) {
        weekend.push({ code: c.code, raw });
        continue;
      }
      const held = owner.get(raw);
      if (held && held !== c.code) {
        clashMap.set(raw, new Set([...(clashMap.get(raw) ?? [held]), c.code]));
      } else {
        owner.set(raw, c.code);
      }
      dates.get(c.code)!.push(raw);
    }
  }

  weekend.sort((a, b) => a.raw.localeCompare(b.raw) || a.code.localeCompare(b.code));
  for (const w of weekend) {
    const taken = new Set([...owner.keys()].filter((d) => owner.get(d) !== w.code));
    const moved = toWorkingDay(w.raw, taken);
    owner.set(moved, w.code);
    dates.get(w.code)!.push(moved);
  }

  for (const list of dates.values()) list.sort();
  return {
    dates,
    clashes: [...clashMap].map(([date, codes]) => ({ date, codes: [...codes] })),
  };
}

export type CalendarCollision = {
  /** The category whose days the proposal would share or displace. */
  code: string;
  dates: string[];
};

/**
 * Whether putting `proposal` on the calendar costs any other category a day.
 *
 * Two ways it can: a weekday both land on, or a weekend shift that used to
 * resolve onto a day the proposal now owns, which would move a category nobody
 * proposed to change. The second is caught by comparing every other category's
 * days with and without the proposal.
 */
export function calendarCollision(
  categories: CalendarCategory[],
  proposal: CalendarCategory,
  year: number,
): CalendarCollision | null {
  if (!proposal.defaultStartDate) return null;
  const others = categories.filter((c) => c.code !== proposal.code);
  const before = categoryCalendar(others, year);
  const after = categoryCalendar([...others, proposal], year);
  const mine = new Set(after.dates.get(proposal.code) ?? []);

  for (const c of others) {
    const was = before.dates.get(c.code) ?? [];
    const now = after.dates.get(c.code) ?? [];
    const shared = now.filter((d) => mine.has(d));
    const displaced = was.filter((d) => !now.includes(d));
    if (shared.length || displaced.length) {
      return { code: c.code, dates: [...new Set([...shared, ...displaced])].sort() };
    }
  }
  return null;
}

/**
 * What a machine's plan SHOULD be, minus what it already has.
 *
 * Returned rather than applied, so the caller can add the missing dates without
 * touching rows somebody has already rescheduled, deferred or completed. A plan
 * generator that overwrote those would quietly erase decisions people made.
 */
export function missingDates(
  wanted: PlannedActivity[],
  existing: { plannedDate: string }[],
): PlannedActivity[] {
  const have = new Set(existing.map((e) => e.plannedDate.slice(0, 10)));
  return wanted.filter((w) => !have.has(w.plannedDate));
}
