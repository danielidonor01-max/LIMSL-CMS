// src/lib/maintenance/governing-procedure.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  governingProcedure,
  procedureLabel,
  type ProcedureRevisionRow,
} from "@/lib/maintenance/governing-procedure";

const rev = (
  revision: number,
  status: string,
  effectiveDate: string | null,
): ProcedureRevisionRow => ({
  id: `rev-${revision}`,
  code: "LIMSL-MAIN-PROC-001",
  revision,
  status,
  effectiveDate,
});

test("the revision in force is the latest one already effective", () => {
  const revisions = [
    rev(1, "SUPERSEDED", "2025-01-01"),
    rev(2, "APPROVED", "2026-03-01"),
  ];
  assert.deepEqual(governingProcedure(revisions, "2026-06-15"), {
    id: "rev-2",
    code: "LIMSL-MAIN-PROC-001",
    revision: 2,
  });
});

test("a revision that takes effect tomorrow does not govern work done today", () => {
  // The failure this prevents: approving revision 3 with a future effective
  // date, then raising a job today, and the job claiming to follow a document
  // that is not yet in force.
  const revisions = [rev(2, "APPROVED", "2026-03-01"), rev(3, "APPROVED", "2026-10-01")];
  assert.equal(governingProcedure(revisions, "2026-09-30")?.revision, 2);
  assert.equal(governingProcedure(revisions, "2026-10-01")?.revision, 3);
});

test("only an approved revision governs anything", () => {
  // A draft is somebody's proposal and a rejected one was refused. Stamping
  // either onto a work order puts a document on a compliance record that nobody
  // signed for.
  for (const status of ["DRAFT", "PENDING_APPROVAL", "REJECTED"]) {
    assert.equal(
      governingProcedure([rev(4, status, "2026-01-01")], "2026-06-01"),
      null,
      `${status} must not govern a job`,
    );
  }
});

test("a superseded revision still does not govern, even if it is the only one dated", () => {
  // Superseded means withdrawn. If nothing approved is in force the honest
  // answer is "none recorded", not "the last one we had".
  assert.equal(governingProcedure([rev(1, "SUPERSEDED", "2025-01-01")], "2026-06-01"), null);
});

test("nothing approved yet reads as nothing, not as revision zero", () => {
  assert.equal(governingProcedure([], "2026-06-01"), null);
  assert.equal(governingProcedure([rev(1, "APPROVED", null)], "2026-06-01"), null);
});

test("two revisions effective the same day break the tie by number, not by luck", () => {
  // Array order is whatever the database returned. Without the explicit
  // tiebreak this would be non-deterministic, and a compliance record that
  // changes its answer between reads is worse than one that is wrong.
  const forwards = [rev(5, "APPROVED", "2026-04-01"), rev(6, "APPROVED", "2026-04-01")];
  const backwards = [...forwards].reverse();
  assert.equal(governingProcedure(forwards, "2026-05-01")?.revision, 6);
  assert.equal(governingProcedure(backwards, "2026-05-01")?.revision, 6);
});

test("a higher number that is not yet effective never beats a lower one that is", () => {
  // Ranking by revision number first would pick 9 here, which is the whole
  // reason the sort is by date first.
  const revisions = [rev(2, "APPROVED", "2026-01-01"), rev(9, "APPROVED", "2027-01-01")];
  assert.equal(governingProcedure(revisions, "2026-06-01")?.revision, 2);
});

test("a full timestamp is compared as a date", () => {
  // Work orders store plain dates but nothing stops a caller passing an ISO
  // timestamp, and comparing "2026-03-01" against "2026-03-01T09:00:00Z" as raw
  // strings would put the revision one day out at the boundary.
  const revisions = [rev(2, "APPROVED", "2026-03-01T00:00:00Z")];
  assert.equal(governingProcedure(revisions, "2026-03-01T09:00:00Z")?.revision, 2);
  assert.equal(governingProcedure(revisions, "2026-02-28")?.revision, undefined);
});

test("the label reads the way it is written on the paper sheet", () => {
  assert.equal(procedureLabel("LIMSL-MAIN-PROC-001", 2), "LIMSL-MAIN-PROC-001 Rev 2");
});

test("a record with no procedure stamped says nothing rather than something wrong", () => {
  // Work orders raised before this existed have no stamp. They must read as
  // absent, not as "Rev 0" or "undefined", which would look like a real answer.
  assert.equal(procedureLabel(null, null), null);
  assert.equal(procedureLabel("LIMSL-MAIN-PROC-001", null), null);
  assert.equal(procedureLabel(null, 2), null);
});
