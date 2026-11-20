// src/lib/maintenance/compliance-log.ts
// The quarterly PM compliance record (LIMSL, 20 Nov 2026).
//
// Management reviews PM compliance quarter by quarter, on paper. The schedule's
// Log tab and its printout both read these figures, and the rule is the KPI's
// own: an activity is compliant when it was completed inside the adherence
// window for its frequency. Counting any completion, however late, would make
// the record impossible to fail.
//
// Pure, so the screen, the printout and the tests cannot disagree.
import { adherenceOf } from "@/lib/maintenance/adherence";
import { DEFAULT_COMPLIANCE_RULE, windowDaysFor, type ComplianceRule } from "@/lib/maintenance/compliance-rule";

export type LogActivity = {
  id: string;
  plannedDate: string;
  activityType: string;
  status: string;
  completedDate: string | null;
  /** When the system was told, where an approved correction has moved the work date. */
  recordedDate?: string | null;
  maintenanceFrequency: string | null;
  category: string | null;
  equipmentName: string | null;
  assetId: string | null;
  workOrderNumber?: string | null;
  batchNumber?: string | null;
  deferredReason?: string | null;
  deferredReviewDate?: string | null;
};

export type LogOutcome = "ON_TIME" | "LATE" | "OUTSIDE_WINDOW" | "OUTSTANDING" | "DEFERRED" | "OPEN" | "NOT_DUE";

export const LOG_OUTCOME_LABELS: Record<LogOutcome, string> = {
  ON_TIME: "Done on time",
  LATE: "Done late, within window",
  OUTSIDE_WINDOW: "Done outside window",
  OUTSTANDING: "Not done",
  DEFERRED: "Deferred",
  OPEN: "Due, window open",
  NOT_DUE: "Not yet due",
};

/** The PM compliance target the schedule and the KPI page already show. */
export const COMPLIANCE_TARGET_PCT = 95;

// Earthing has its own module and its own log since 17 Nov 2026; the plan rows
// its retired register entry left behind are not PM work anybody will do.
export const LOG_EXCLUDED_CATEGORIES = ["EARTHING"];

export const quarterOf = (isoDate: string): number => Math.floor((Number(isoDate.slice(5, 7)) - 1) / 3) + 1;
export const yearOf = (isoDate: string): number => Number(isoDate.slice(0, 4));

const QUARTER_MONTHS = ["January to March", "April to June", "July to September", "October to December"];
export const quarterLabel = (year: number, quarter: number) => `Q${quarter} ${year}, ${QUARTER_MONTHS[quarter - 1]}`;

const plusDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function outcomeOf(
  row: LogActivity,
  today: string,
  rule: ComplianceRule = DEFAULT_COMPLIANCE_RULE,
): { outcome: LogOutcome; daysLate: number | null } {
  const window = windowDaysFor(rule, row.maintenanceFrequency);
  if (row.status === "COMPLETED") {
    // A completion with no date on it is taken as done on the day, as the KPI does.
    if (!row.completedDate) return { outcome: "ON_TIME", daysLate: null };
    const a = adherenceOf(row.plannedDate, row.completedDate.slice(0, 10), row.maintenanceFrequency, window);
    return {
      outcome: a.verdict === "ON_TIME" ? "ON_TIME" : a.verdict === "LATE_WITHIN_WINDOW" ? "LATE" : "OUTSIDE_WINDOW",
      daysLate: a.daysLate,
    };
  }
  if (row.plannedDate > today) return { outcome: "NOT_DUE", daysLate: null };
  if (row.status === "DEFERRED") return { outcome: "DEFERRED", daysLate: null };
  // Unfinished work is judged when the rule says so, not before: on its due
  // day it can still be done on time, and inside its window it can still be
  // done in time. Until then it is open, and stays out of the percentage.
  const judgedAfter = rule.countFrom === "WINDOW_CLOSED" ? plusDays(row.plannedDate, window) : row.plannedDate;
  return { outcome: today <= judgedAfter ? "OPEN" : "OUTSTANDING", daysLate: null };
}

export type LogTally = {
  planned: number;
  /** What compliance is measured against: everything planned, less work not yet due and work still open. */
  due: number;
  onTime: number;
  late: number;
  outsideWindow: number;
  outstanding: number;
  deferred: number;
  /** Overdue, but not yet counted against the quarter under the counting rule. */
  open: number;
  notDue: number;
  /** Done on time or inside the window. */
  compliant: number;
  /** 0 to 100, or null when nothing has fallen due. */
  compliancePct: number | null;
};

const emptyTally = (): LogTally => ({
  planned: 0,
  due: 0,
  onTime: 0,
  late: 0,
  outsideWindow: 0,
  outstanding: 0,
  deferred: 0,
  open: 0,
  notDue: 0,
  compliant: 0,
  compliancePct: null,
});

function add(t: LogTally, outcome: LogOutcome) {
  t.planned++;
  if (outcome === "ON_TIME") t.onTime++;
  else if (outcome === "LATE") t.late++;
  else if (outcome === "OUTSIDE_WINDOW") t.outsideWindow++;
  else if (outcome === "OUTSTANDING") t.outstanding++;
  else if (outcome === "DEFERRED") t.deferred++;
  else if (outcome === "OPEN") t.open++;
  else t.notDue++;
}

function settle(t: LogTally): LogTally {
  t.due = t.planned - t.notDue - t.open;
  t.compliant = t.onTime + t.late;
  // Rounded down: 94.9% is not 95%, and the record must not round its way to target.
  t.compliancePct = t.due ? Math.floor((t.compliant / t.due) * 100) : null;
  return t;
}

export type LogEntry = LogActivity & { outcome: LogOutcome; daysLate: number | null };

export type QuarterLog = {
  year: number;
  quarter: number;
  activityType: string;
  total: LogTally;
  byCategory: { category: string; tally: LogTally }[];
  entries: LogEntry[];
  /** The four quarters of the year, for the overview. */
  quarters: { quarter: number; tally: LogTally }[];
};

const inScope = (r: LogActivity, activityType: string) =>
  r.activityType === activityType && !LOG_EXCLUDED_CATEGORIES.includes(r.category ?? "");

export function buildQuarterLog(
  rows: LogActivity[],
  opts: { year: number; quarter: number; activityType: string; today: string; rule?: ComplianceRule },
): QuarterLog {
  const { year, quarter, activityType, today } = opts;
  const rule = opts.rule ?? DEFAULT_COMPLIANCE_RULE;
  const scoped = rows.filter((r) => inScope(r, activityType) && yearOf(r.plannedDate) === year);

  const quarters = [1, 2, 3, 4].map((q) => ({ quarter: q, tally: emptyTally() }));
  const total = emptyTally();
  const cats = new Map<string, LogTally>();
  const entries: LogEntry[] = [];

  for (const r of scoped) {
    const q = quarterOf(r.plannedDate);
    const o = outcomeOf(r, today, rule);
    add(quarters[q - 1].tally, o.outcome);
    if (q !== quarter) continue;
    add(total, o.outcome);
    const key = r.category ?? "UNCATEGORISED";
    if (!cats.has(key)) cats.set(key, emptyTally());
    add(cats.get(key)!, o.outcome);
    entries.push({ ...r, ...o });
  }

  quarters.forEach((q) => settle(q.tally));
  entries.sort(
    (a, b) => a.plannedDate.localeCompare(b.plannedDate) || (a.equipmentName ?? "").localeCompare(b.equipmentName ?? ""),
  );

  return {
    year,
    quarter,
    activityType,
    total: settle(total),
    byCategory: [...cats.entries()].map(([category, tally]) => ({ category, tally: settle(tally) })),
    entries,
    quarters,
  };
}

/**
 * Compliance of any set of planned activities under the counting rule. The
 * KPI page and the schedule header use this, so they give the Log's figure.
 */
export function complianceTally(rows: LogActivity[], today: string, rule: ComplianceRule = DEFAULT_COMPLIANCE_RULE): LogTally {
  const t = emptyTally();
  for (const r of rows) add(t, outcomeOf(r, today, rule).outcome);
  return settle(t);
}

/** Several tallies as one, for the year to date. */
export function sumTallies(tallies: LogTally[]): LogTally {
  const t = emptyTally();
  for (const x of tallies) {
    t.planned += x.planned;
    t.onTime += x.onTime;
    t.late += x.late;
    t.outsideWindow += x.outsideWindow;
    t.outstanding += x.outstanding;
    t.deferred += x.deferred;
    t.open += x.open;
    t.notDue += x.notDue;
  }
  return settle(t);
}

export type QuarterStanding = "CLOSED" | "CURRENT" | "AHEAD";

/** Whether a quarter is over, running, or still to come, as at `today`. */
export function quarterStanding(year: number, quarter: number, today: string): QuarterStanding {
  const now = yearOf(today) * 4 + quarterOf(today);
  const q = year * 4 + quarter;
  return q < now ? "CLOSED" : q === now ? "CURRENT" : "AHEAD";
}

/** Years the plan holds rows for, newest first. */
export function logYears(rows: LogActivity[]): number[] {
  return [...new Set(rows.map((r) => yearOf(r.plannedDate)).filter((y) => Number.isFinite(y)))].sort((a, b) => b - a);
}

/** One sentence a manager can read without the table. */
export function logHeadline(log: QuarterLog, noun: string): string {
  const t = log.total;
  if (t.planned === 0) return `No ${noun} was planned for Q${log.quarter} ${log.year}.`;
  if (t.due === 0) return `Nothing has fallen due yet in Q${log.quarter} ${log.year}.`;
  return `${t.compliant} of ${t.due} ${noun} due in Q${log.quarter} ${log.year} done on time: ${t.compliancePct}% compliance.`;
}
