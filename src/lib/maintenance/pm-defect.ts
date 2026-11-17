// src/lib/maintenance/pm-defect.ts
// What a PM found, as one of three answers (LIMSL, 16 Nov 2026):
//
//   NONE   no defect
//   FIXED  a defect, fixed during the PM: recorded, nothing to report
//   OPEN   a defect that still needs a repair: offered as a fault to report
//
// Stored in the checklist's existing columns, so no migration: OPEN is
// correctiveActionRequired; FIXED is a described action without it. Before
// this, the form had only the "corrective action required" box, so a record
// from then with the box ticked reads as OPEN even if its text says it was
// fixed; that is the honest reading of what was filed.
export type DefectOutcome = "NONE" | "FIXED" | "OPEN";

export function defectOutcome(c: {
  correctiveActionRequired?: boolean | null;
  actionDescription?: string | null;
}): DefectOutcome {
  if (c.correctiveActionRequired) return "OPEN";
  return c.actionDescription?.trim() ? "FIXED" : "NONE";
}
