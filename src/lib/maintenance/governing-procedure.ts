// src/lib/maintenance/governing-procedure.ts
// Which revision of the maintenance procedure a job was done under.
//
// AGENTS.md §1: "Every state change that a regulator or auditor would care about
// must be traceable: who did it, when, **under which signed-off procedure
// revision**." The first two were recorded from the start. The third was not:
// work orders carried no reference to the procedure at all, so the only way to
// answer "which revision governed this job" was to look at which revision
// happens to be effective today and assume.
//
// That assumption is wrong precisely when it matters. A job done in March under
// revision 2, read back in September after revision 3 took effect, would appear
// to have been done under revision 3 — a record that says something untrue about
// a controlled document. An auditor sampling old work orders finds that.
//
// So the governing revision is STAMPED ON THE RECORD when the work order is
// raised, and never recomputed. The stamp is the whole point: it is a fact about
// that job, not a lookup.
//
// It is stamped at creation rather than at completion because the technician has
// to know which revision to follow while doing the work, not afterwards. A paper
// work order names its procedure in the same place, for the same reason.

export interface ProcedureRevisionRow {
  id: string;
  code: string;
  revision: number;
  status: string;
  effectiveDate: string | null;
}

export interface GoverningProcedure {
  id: string;
  code: string;
  revision: number;
}

/**
 * The revision in force on `asOf` (an ISO date, YYYY-MM-DD), or null when the
 * procedure has never been approved.
 *
 * Only APPROVED revisions govern anything. A draft is a proposal and a
 * superseded revision is history; stamping either onto a work order would put a
 * document on the record that nobody signed for, or one that had already been
 * withdrawn when the work was done.
 */
export function governingProcedure(
  revisions: ProcedureRevisionRow[],
  asOf: string,
): GoverningProcedure | null {
  const candidates = revisions.filter(
    (r) =>
      r.status === "APPROVED" &&
      typeof r.effectiveDate === "string" &&
      // Dates are stored as ISO text throughout, so a string compare is a date
      // compare. A revision effective tomorrow does not govern work done today.
      r.effectiveDate.slice(0, 10) <= asOf.slice(0, 10),
  );
  if (candidates.length === 0) return null;

  // The latest one to take effect on or before that date. Ranked by effective
  // date first and revision number second, because the revision number is the
  // tiebreak when two took effect the same day, not the other way round: a
  // higher number that is not yet effective must never win.
  candidates.sort((a, b) => {
    const byDate = (a.effectiveDate ?? "").localeCompare(b.effectiveDate ?? "");
    return byDate !== 0 ? byDate : a.revision - b.revision;
  });

  const winner = candidates[candidates.length - 1];
  return { id: winner.id, code: winner.code, revision: winner.revision };
}

/** How the stamp reads on a record and on a printed sheet. */
export function procedureLabel(
  code: string | null | undefined,
  revision: number | null | undefined,
): string | null {
  if (!code || revision === null || revision === undefined) return null;
  return `${code} Rev ${revision}`;
}
