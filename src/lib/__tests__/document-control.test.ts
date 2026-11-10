// src/lib/__tests__/document-control.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { revisionHistory, columnsFor, paperDate, type SignStep } from "@/lib/document-control";

const step = (stepOrder: number, role: string, signedAt: string | null, name?: string, jobTitle?: string): SignStep => ({
  stepOrder,
  role,
  required: true,
  status: signedAt ? "SIGNED" : "PENDING",
  signedByName: signedAt ? (name ?? role) : null,
  signedByRole: signedAt ? role : null,
  signedByJobTitle: jobTitle ?? null,
  signedAt,
});

test("a document nobody has signed has no revision history yet", () => {
  const rows = revisionHistory("WMS", [
    { id: "w1", revision: 0, steps: [step(1, "FOREMAN", null), step(2, "MAINTENANCE_MANAGER", null), step(3, "FACTORY_MANAGER", null)] },
  ]);
  assert.equal(rows.length, 0);
});

test("a chain from before the two passes: first signature is the review issue, the last the implementation issue", () => {
  const steps = [
    step(1, "FOREMAN", "2026-01-27T09:00:00Z", "Daniel Idonor", "Maintenance Tech."),
    step(2, "MAINTENANCE_MANAGER", "2026-02-01T09:00:00Z", "Austin Azeke", "Factory Supervisor"),
    step(3, "FACTORY_MANAGER", "2026-09-10T09:00:00Z", "Kenneth Aloziem", "Factory Coord."),
  ];
  const rows = revisionHistory("WMS", [{ id: "w1", revision: 0, steps }]);
  assert.deepEqual(rows.map((r) => [r.rev, r.stage, r.date?.slice(0, 10)]), [
    [1, "IMPLEMENTATION", "2026-09-10"],
    [0, "REVIEW", "2026-01-27"],
  ]);
  assert.equal(rows[0].prepared[0].name, "Daniel Idonor");
  assert.equal(rows[0].prepared[0].title, "Maintenance Tech.");
  assert.equal(rows[0].reviewed[0].title, "Factory Supervisor");
  assert.equal(rows[0].approved[0].name, "Kenneth Aloziem");
});

test("an approval still waiting shows the role, not a name", () => {
  const rows = revisionHistory("JHA", [
    { id: "j1", revision: 0, steps: [step(1, "HSE", "2026-03-01T09:00:00Z"), step(2, "MAINTENANCE_MANAGER", null), step(3, "FACTORY_MANAGER", null)] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stage, "REVIEW");
  assert.equal(rows[0].approved[0].name, null);
  assert.equal(rows[0].approved[0].title, "Factory Manager");
});

test("stage numbers run on across revisions, newest first", () => {
  const done = (d: string) => [step(1, "FOREMAN", d), step(2, "MAINTENANCE_MANAGER", d), step(3, "FACTORY_MANAGER", d)];
  const rows = revisionHistory("WMS", [
    { id: "w2", revision: 1, changeSummary: "Added lockout step", steps: [step(1, "FOREMAN", "2026-10-01T09:00:00Z"), step(2, "MAINTENANCE_MANAGER", null), step(3, "FACTORY_MANAGER", null)] },
    { id: "w1", revision: 0, steps: done("2026-02-01T09:00:00Z") },
  ]);
  assert.deepEqual(rows.map((r) => [r.rev, r.stage]), [
    [2, "REVIEW"],
    [1, "IMPLEMENTATION"],
    [0, "REVIEW"],
  ]);
  assert.equal(rows[0].note, "Added lockout step");
});

test("a procedure's author prepared it; QA/QC and the managers reviewed; the COO approved", () => {
  const cols = columnsFor("PROCEDURE", {
    preparedByName: "Ada Obi",
    steps: [step(1, "QA_QC", "2026-01-01"), step(2, "MAINTENANCE_MANAGER", "2026-01-02"), step(3, "FACTORY_MANAGER", "2026-01-03"), step(4, "COO", "2026-01-04")],
  });
  assert.equal(cols.prepared[0].name, "Ada Obi");
  assert.deepEqual(cols.reviewed.map((p) => p.title), ["QA/QC Supervisor", "Maintenance Manager", "Factory Manager"]);
  assert.equal(cols.approved[0].title, "Chief Operating Officer");
});

test("paper date format", () => {
  assert.equal(paperDate("2026-09-10T08:59:00Z"), "10-09-26");
  assert.equal(paperDate(null), "-");
});

test("an approved document whose signatures are not on record is still shown as issued", () => {
  const rows = revisionHistory("PROCEDURE", [
    { id: "p1", revision: 1, status: "APPROVED", effectiveDate: "2026-03-01", preparedByName: "Ada Obi", steps: [] },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stage, "IMPLEMENTATION");
  assert.equal(rows[0].date, "2026-03-01");
  assert.equal(rows[0].prepared[0].name, "Ada Obi");
  assert.equal(rows[0].approved[0].recorded, false);
  assert.equal(rows[0].approved[0].title, "Chief Operating Officer");
});

// The two-pass chain as it is defined now: review pass, then implementation.
const twoPass = (dates: (string | null)[]) => {
  const roles = ["FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER"];
  const names = ["Daniel Idonor", "Austin Azeke", "Kenneth Aloziem"];
  return dates.map((d, i) => step(i + 1, roles[i % 3], d, names[i % 3]));
};

test("two passes: review and implementation are separate rows with their own signatures", () => {
  const rows = revisionHistory("WMS", [
    {
      id: "w1",
      revision: 0,
      steps: twoPass([
        "2026-01-27T09:00:00Z", "2026-01-28T09:00:00Z", "2026-01-29T09:00:00Z",
        "2026-09-08T09:00:00Z", "2026-09-09T09:00:00Z", "2026-09-10T09:00:00Z",
      ]),
    },
  ]);
  assert.deepEqual(rows.map((r) => [r.rev, r.stage, r.date?.slice(0, 10)]), [
    [1, "IMPLEMENTATION", "2026-09-10"],
    [0, "REVIEW", "2026-01-29"],
  ]);
  assert.equal(rows[1].approved[0].signedAt, "2026-01-29T09:00:00Z");
  assert.equal(rows[0].approved[0].signedAt, "2026-09-10T09:00:00Z");
});

test("two passes: implementation does not appear until its pass is signed, and an unfinished pass has no date", () => {
  const rows = revisionHistory("WMS", [
    { id: "w1", revision: 0, steps: twoPass(["2026-01-27T09:00:00Z", "2026-01-28T09:00:00Z", null, null, null, null]) },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].stage, "REVIEW");
  assert.equal(rows[0].date, null);
  assert.equal(rows[0].approved[0].name, null);
});
