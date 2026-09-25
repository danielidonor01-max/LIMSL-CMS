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

/**
 * The dates a machine is due in a given year.
 *
 * Counting runs from the machine's anchor — when it was commissioned, or when
 * it was last serviced — so a quarterly machine commissioned in February falls
 * due in February, May, August and November rather than being swept onto a
 * calendar quarter it has nothing to do with. Two machines of the same category
 * bought six months apart are genuinely due at different times, and pretending
 * otherwise is how a plan stops describing the factory.
 */
export function plannedDatesFor(input: {
  frequency?: string | null;
  /** Commissioning date, or last maintenance, whichever the register knows. */
  anchorDate?: string | null;
  year: number;
  /** Nothing is planned before this, so adding a machine today does not
   *  back-date work nobody could have done. */
  notBefore?: string | null;
}): PlannedActivity[] {
  const months = FREQUENCY_MONTHS[String(input.frequency ?? "").toUpperCase()];
  // No interval recorded is not "monthly by default" — it is a machine nobody
  // has decided about, and inventing a schedule for it would be inventing work.
  if (!months) return [];

  const anchor = (input.anchorDate ?? "").slice(0, 10);
  const anchorDay = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? Number(anchor.slice(8, 10)) : 1;
  const anchorMonth = /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? Number(anchor.slice(5, 7)) : 1;

  const out: PlannedActivity[] = [];
  // Walk the year in steps of the interval, starting from the anchor month
  // brought forward into this year.
  let month = ((anchorMonth - 1) % months) + 1;
  for (; month <= 12; month += months) {
    const day = Math.min(anchorDay, daysIn(input.year, month));
    const plannedDate = iso(input.year, month, day);
    if (input.notBefore && plannedDate < input.notBefore.slice(0, 10)) continue;
    out.push({
      plannedDate,
      month,
      quarter: Math.floor((month - 1) / 3) + 1,
      activityType: "PM",
    });
  }
  return out;
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
