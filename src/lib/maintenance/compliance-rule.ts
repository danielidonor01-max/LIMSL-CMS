// src/lib/maintenance/compliance-rule.ts
// How PM compliance is counted, as a setting rather than a constant
// (LIMSL, 20 Nov 2026).
//
// Two things decide the figure: how many days after its planned date a PM may
// still be done and count (the window, by frequency), and the moment an
// unfinished PM starts counting against the quarter. Both were written into the
// code. They are the organisation's rule, so the Super Admin sets them, every
// change is in the audit log, and the Log, the KPI page and the schedule read
// this one rule so the system never gives two compliance figures.
//
// Pure: the store, the API, the screens and the tests share it.
import { ADHERENCE_WINDOW_DAYS } from "@/lib/maintenance/adherence";

/**
 * When an unfinished PM starts to count against compliance.
 *   WINDOW_CLOSED: once its window has passed. Until then it is overdue but
 *                  can still be done in time, so it is shown as open.
 *   DUE_DATE:      the day after its planned date.
 */
export type CountFrom = "WINDOW_CLOSED" | "DUE_DATE";

export type ComplianceRule = {
  countFrom: CountFrom;
  /** Days after the planned date inside which a completion still counts, by frequency. */
  windows: Record<string, number>;
  /** For a frequency not listed. */
  defaultWindow: number;
};

export const RULE_FREQUENCIES = ["WEEKLY", "MONTHLY", "BI_MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"] as const;

export const DEFAULT_COMPLIANCE_RULE: ComplianceRule = {
  countFrom: "WINDOW_CLOSED",
  windows: { ...ADHERENCE_WINDOW_DAYS },
  defaultWindow: 14,
};

export const COUNT_FROM_LABELS: Record<CountFrom, string> = {
  WINDOW_CLOSED: "When its window has closed",
  DUE_DATE: "The day after its planned date",
};

const MAX_WINDOW = 90;
const whole = (v: unknown) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "") ? Number(v) : NaN);

/** Null when the rule is acceptable, otherwise what is wrong with it. */
export function validateComplianceRule(input: unknown): string | null {
  const r = (input ?? {}) as Partial<ComplianceRule>;
  if (r.countFrom !== "WINDOW_CLOSED" && r.countFrom !== "DUE_DATE") return "Choose when unfinished work starts to count.";
  for (const f of RULE_FREQUENCIES) {
    const n = whole(r.windows?.[f]);
    if (!Number.isInteger(n) || n < 0 || n > MAX_WINDOW) {
      return `The window for ${f.replace(/_/g, "-").toLowerCase()} work must be a whole number of days from 0 to ${MAX_WINDOW}.`;
    }
  }
  return null;
}

/** A stored or submitted rule made safe: anything missing or out of range falls back to the default. */
export function normaliseComplianceRule(input: unknown): ComplianceRule {
  const r = (input ?? {}) as Partial<ComplianceRule>;
  const windows: Record<string, number> = {};
  for (const f of RULE_FREQUENCIES) {
    const n = whole(r.windows?.[f]);
    windows[f] = Number.isInteger(n) && n >= 0 && n <= MAX_WINDOW ? n : DEFAULT_COMPLIANCE_RULE.windows[f];
  }
  return {
    countFrom: r.countFrom === "DUE_DATE" ? "DUE_DATE" : "WINDOW_CLOSED",
    windows,
    defaultWindow: DEFAULT_COMPLIANCE_RULE.defaultWindow,
  };
}

export function windowDaysFor(rule: ComplianceRule, frequency: string | null | undefined): number {
  return rule.windows[(frequency ?? "").toUpperCase().trim()] ?? rule.defaultWindow;
}

/** The rule in one sentence, for the foot of the screen and the printed record. */
export function describeRule(rule: ComplianceRule): string {
  const w = (f: string) => `${rule.windows[f]} day${rule.windows[f] === 1 ? "" : "s"}`;
  const windows = `bi-monthly ${w("BI_MONTHLY")}, quarterly ${w("QUARTERLY")}, semi-annual ${w("SEMI_ANNUAL")}, annual ${w("ANNUAL")}`;
  return (
    `A PM is done in time when it is completed on or before its planned date, or inside the window for its frequency (${windows}). ` +
    (rule.countFrom === "WINDOW_CLOSED"
      ? "Unfinished work counts against the quarter once its window has closed; until then it is shown as due with its window open."
      : "Unfinished work counts against the quarter from the day after its planned date.")
  );
}
