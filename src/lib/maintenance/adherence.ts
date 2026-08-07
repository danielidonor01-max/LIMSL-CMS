// src/lib/maintenance/adherence.ts
// Schedule adherence, and criticality-driven maintenance strategy.
//
// "Completed" said nothing about WHEN. A PM planned for 1 January and performed
// on 30 June counted as fully compliant, which made PM compliance — the
// headline ISO 9001 metric — impossible to fail and therefore meaningless. A
// monthly PM done six weeks late is not a monthly PM.
//
// The window scales with frequency: a weekly task done five days late has
// nearly missed a whole cycle, while an annual task five days late is on time
// by any sane reading.

export const ADHERENCE_WINDOW_DAYS: Record<string, number> = {
  WEEKLY: 3,
  MONTHLY: 7,
  BI_MONTHLY: 10,
  QUARTERLY: 14,
  SEMI_ANNUAL: 21,
  ANNUAL: 30,
};

const DEFAULT_WINDOW_DAYS = 14;

export const adherenceWindowFor = (frequency: string | null | undefined): number =>
  ADHERENCE_WINDOW_DAYS[frequency ?? ""] ?? DEFAULT_WINDOW_DAYS;

// Whole days between two ISO dates (completed − planned). Negative means early.
export function daysBetween(plannedDate: string, completedDate: string): number {
  const a = Date.parse(`${plannedDate}T00:00:00Z`);
  const b = Date.parse(`${completedDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export type AdherenceVerdict = "ON_TIME" | "LATE_WITHIN_WINDOW" | "MISSED";

// Early or on the day is on time. Inside the window is late but still counts as
// adherent — real workshops have shift patterns and part lead times. Beyond it,
// the activity was missed, however sincerely it was eventually performed.
export function adherenceOf(
  plannedDate: string,
  completedDate: string,
  frequency: string | null | undefined,
): { daysLate: number; verdict: AdherenceVerdict; compliant: boolean } {
  const daysLate = daysBetween(plannedDate, completedDate);
  const window = adherenceWindowFor(frequency);
  if (daysLate <= 0) return { daysLate, verdict: "ON_TIME", compliant: true };
  if (daysLate <= window) return { daysLate, verdict: "LATE_WITHIN_WINDOW", compliant: true };
  return { daysLate, verdict: "MISSED", compliant: false };
}

// ── Criticality-driven strategy ──────────────────────────────────────────────
// equipment.criticality was stored, badged in four colours, and consumed by
// nothing: not PM frequency, not work-order priority, not escalation lead time.
// "How does criticality drive your maintenance strategy?" had no answer.

export const CRITICALITY_PM_FREQUENCY: Record<string, string> = {
  CRITICAL: "MONTHLY",
  HIGH: "BI_MONTHLY",
  MEDIUM: "QUARTERLY",
  LOW: "SEMI_ANNUAL",
};

export const CRITICALITY_WO_PRIORITY: Record<string, string> = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
};

// Escalate sooner on the machines that stop production.
export const CRITICALITY_LEAD_DAYS: Record<string, number> = {
  CRITICAL: 7,
  HIGH: 5,
  MEDIUM: 3,
  LOW: 2,
};

export const suggestedPmFrequency = (criticality: string | null | undefined): string =>
  CRITICALITY_PM_FREQUENCY[criticality ?? ""] ?? "QUARTERLY";

export const suggestedWoPriority = (criticality: string | null | undefined): string =>
  CRITICALITY_WO_PRIORITY[criticality ?? ""] ?? "MEDIUM";

export const escalationLeadDaysFor = (criticality: string | null | undefined): number =>
  CRITICALITY_LEAD_DAYS[criticality ?? ""] ?? 3;
