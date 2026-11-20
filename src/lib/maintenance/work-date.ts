// src/lib/maintenance/work-date.ts
// Correcting the date work was done (LIMSL, 20 Nov 2026).
//
// A plan row held one date doing two jobs: when the PM was done, and when it
// was entered. Work done in January and entered in November then read as 300
// days late, and the only way to put it right was to edit the date, which a
// system of record must not allow quietly.
//
// So the two facts are kept apart. "Work done on" is what compliance is
// measured against. "Recorded on" is when the system was told, and never
// changes. Moving the work date is a numbered request (WDC-…) that names its
// evidence and its reason, is approved by the Maintenance Manager, and is
// applied by that signature and nothing else. The request, the approval and
// the dates before and after are all on the record.
//
// Pure rules here; the database half is ./work-date-db.ts.

export const WORK_DATE_ENTITY = "WORK_DATE";

export type WorkDateRow = {
  id: string;
  status: string;
  plannedDate: string;
  /** The work date as it stands now. */
  completedDate: string | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const dayOf = (s: string | null | undefined) => (s ?? "").slice(0, 10);

/** Null when the request can be raised, otherwise why not. */
export function validateWorkDateRequest(input: {
  workDate: unknown;
  evidence: unknown;
  reason: unknown;
  rows: WorkDateRow[];
  today: string;
}): string | null {
  const workDate = String(input.workDate ?? "");
  if (!ISO.test(workDate) || Number.isNaN(Date.parse(`${workDate}T00:00:00Z`))) return "Give the date the work was done.";
  if (workDate > input.today) return "The work date cannot be in the future.";
  if (Number(workDate.slice(0, 4)) < 2000) return "That work date is not plausible.";
  if (String(input.evidence ?? "").trim().length < 5) {
    return "Name the evidence for this date: the paper record, job card or log entry that shows it.";
  }
  if (String(input.reason ?? "").trim().length < 5) return "Say why the recorded date is not the date the work was done.";
  if (input.rows.length === 0) return "There is no completed work on this batch to correct.";
  if (input.rows.some((r) => r.status !== "COMPLETED")) return "Only completed work has a work date to correct.";
  if (input.rows.every((r) => dayOf(r.completedDate) === workDate)) return "The work is already recorded on that date.";
  return null;
}

/** The person who approves may not be the person who asks. */
export function mayRequestWorkDate(role: string | null | undefined, assignRoles: readonly string[]): string | null {
  if (!assignRoles.includes(role ?? "")) return "A work date correction is requested by the Foreman or a manager.";
  if (role === "MAINTENANCE_MANAGER") {
    return "The Maintenance Manager approves work date corrections, so somebody else raises the request.";
  }
  return null;
}
