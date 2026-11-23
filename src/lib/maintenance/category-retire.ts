// src/lib/maintenance/category-retire.ts
// Retiring a category that is no longer needed (LIMSL, 23 Nov 2026).
//
// A category is retired, never deleted: its past PMs, batches, method
// statement and hazard analysis stay on record under its name. Retiring takes
// it out of the dropdowns and off the calendar, so its days are free for the
// others. It is a change request like any other change to a category, signed
// by the Maintenance Manager and the QA/QC Supervisor, and it is refused while
// anything still depends on the category.
//
// Pure: what stands in the way. The route and the apply step both ask it.

export type RetireFacts = {
  /** Machines in service that still belong to the category. */
  machines: number;
  /** Planned visits under the category that are not completed. */
  openVisits: number;
  /** PM batches for the category that are still open. */
  openBatches: number;
};

/** Null when the category can be retired, otherwise what must be done first. */
export function retireBlocker(f: RetireFacts): string | null {
  if (f.machines > 0) {
    return `${f.machines} machine${f.machines === 1 ? " is" : "s are"} still in this category. Move ${f.machines === 1 ? "it" : "them"} to another category first, with Move equipment.`;
  }
  if (f.openBatches > 0) {
    return `${f.openBatches} PM batch${f.openBatches === 1 ? " is" : "es are"} still open for this category. Finish or cancel ${f.openBatches === 1 ? "it" : "them"} first.`;
  }
  if (f.openVisits > 0) {
    return `${f.openVisits} planned visit${f.openVisits === 1 ? " is" : "s are"} still open under this category. Complete or remove ${f.openVisits === 1 ? "it" : "them"} first.`;
  }
  return null;
}

export const CATEGORY_CHANGE_KINDS = ["CREATE", "UPDATE", "RETIRE", "REINSTATE"] as const;
export type CategoryChangeKind = (typeof CATEGORY_CHANGE_KINDS)[number];

export function changeKindOf(raw: unknown): CategoryChangeKind {
  const k = String(raw ?? "UPDATE").toUpperCase();
  return (CATEGORY_CHANGE_KINDS as readonly string[]).includes(k) ? (k as CategoryChangeKind) : "UPDATE";
}
