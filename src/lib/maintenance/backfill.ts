// src/lib/maintenance/backfill.ts
// Entering PMs and inspections that were done on paper (LIMSL, 18 Nov 2026).
//
// The work happened and the paper file is the evidence. These records are its
// entry into the system, and they must never read as if they had been signed
// on the day of the work:
//
//   • every record says it was backfilled, and from what;
//   • no checklist result is invented: the readings stay on the paper;
//   • every signature is still given by the named person, in their own login,
//     and carries the date they actually signed.
//
// Pure rules only, so the script, the permit reconciler and the inbox agree.
import { chainSummary } from "@/lib/signoff/chains";

/** Marks a pending sign-off step, and the batch notes, as part of the backfill. */
export const BACKFILL_TAG = "BACKFILL-2026";

/**
 * A permit entered from the paper file. Its dates are in the past, so the
 * validity clock must not run on it: as PENDING_APPROVAL it would expire on the
 * first read, and as ACTIVE it would raise a successor and a non-conformity.
 * It becomes CLOSED when both of its chains are signed.
 */
export const BACKFILLED_PERMIT = "BACKFILLED";

/** Ajayi joins the rotation with the work planned from this date. */
export const ROTATION_START = "2026-07-01";

/** Left for manual handling, and the system retired from the register. */
export const BACKFILL_EXCLUDED_CATEGORIES = ["CNC_HEAVY", "EARTHING"];

export const isBackfillStep = (comments: string | null | undefined) => comments === BACKFILL_TAG;

export type BackfillPlanRow = {
  id: string;
  equipmentId: string;
  category: string;
  plannedDate: string;
  activityType: string;
  status: string;
  batchId: string | null;
  removedAt: string | null;
};

export type BackfillBatch<T extends BackfillPlanRow = BackfillPlanRow> = {
  category: string;
  plannedDate: string;
  activityType: "PM" | "INS";
  rows: T[];
};

/** Overdue PMs and inspections up to `today`, outside the excluded categories. */
export function eligibleForBackfill(row: BackfillPlanRow, today: string): boolean {
  return (
    row.status === "OVERDUE" &&
    (row.activityType === "PM" || row.activityType === "INS") &&
    row.plannedDate <= today &&
    !row.batchId &&
    !row.removedAt &&
    !BACKFILL_EXCLUDED_CATEGORIES.includes(row.category)
  );
}

/**
 * The overdue PMs of one category, entered on its own later run (CNC Heavy
 * Duty, 20 Nov 2026). Inspections are left out: only the PM plan was asked for.
 */
export function eligibleForCategoryPm(row: BackfillPlanRow, today: string, category: string): boolean {
  return (
    row.category === category &&
    row.status === "OVERDUE" &&
    row.activityType === "PM" &&
    row.plannedDate <= today &&
    !row.batchId &&
    !row.removedAt
  );
}

/**
 * One batch per category, date and activity, oldest first. PMs and inspections
 * due on the same day stay in separate batches: each is its own record.
 */
export function groupIntoBatches<T extends BackfillPlanRow>(rows: T[]): BackfillBatch<T>[] {
  const groups = new Map<string, BackfillBatch<T>>();
  for (const r of rows) {
    const key = `${r.plannedDate}|${r.category}|${r.activityType}`;
    const g = groups.get(key);
    if (g) g.rows.push(r);
    else {
      groups.set(key, {
        category: r.category,
        plannedDate: r.plannedDate,
        activityType: r.activityType as "PM" | "INS",
        rows: [r],
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.plannedDate.localeCompare(b.plannedDate) ||
      a.category.localeCompare(b.category) ||
      a.activityType.localeCompare(b.activityType),
  );
}

/**
 * Who carried out each batch, in the order given. Daniel alone before July;
 * from July the two alternate, batch by batch, starting with Ajayi.
 */
export function rotateTechnicians<P>(dates: string[], daniel: P, ajayi: P): P[] {
  let turn = 0;
  return dates.map((date) => {
    if (date < ROTATION_START) return daniel;
    return turn++ % 2 === 0 ? ajayi : daniel;
  });
}

/** Both chains signed: the backfilled permit is closed. */
export function backfilledPermitComplete(
  approval: { required: boolean | null; status: string }[],
  closeout: { required: boolean | null; status: string }[],
): boolean {
  return chainSummary(approval).complete && chainSummary(closeout).complete;
}

/**
 * True for a record entered from the paper file. Its blank fields mean "on the
 * paper", never "no" or "none", so screens must not read them as answers.
 */
export const isPaperRecord = (note: string | null | undefined) => !!note?.startsWith(BACKFILL_TAG);

/** The note as a reader should see it, without the search tag. */
export const paperRecordText = (note: string) => note.replace(`${BACKFILL_TAG}: entered`, "Entered");

export const backfillNote = (date: string) =>
  `${BACKFILL_TAG}: entered on ${new Date().toISOString().slice(0, 10)} from the paper record held by Maintenance. ` +
  `The work date ${date} is the date on the annual schedule; the paper record governs if it differs. ` +
  `Readings and results are on the paper record.`;
