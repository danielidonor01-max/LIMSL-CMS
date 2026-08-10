// src/lib/maintenance/work-order-commencement.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commencementFor,
  isAwaitingRetrospectiveApproval,
  retrospectiveApprovalAgeDays,
} from "./work-order-commencement";

test("an emergency commences immediately and is flagged retrospective", () => {
  const d = commencementFor("EMERGENCY");
  assert.equal(d.status, "OPEN");
  assert.equal(d.retrospective, true);
});

test("every other type waits for approval", () => {
  for (const type of ["PREVENTIVE", "CORRECTIVE", "INSPECTION", "CALIBRATION"]) {
    const d = commencementFor(type);
    assert.equal(d.status, "PENDING_APPROVAL", `${type} should wait for approval`);
    assert.equal(d.retrospective, false);
  }
});

test("a corrective job is not an emergency, so the exception cannot swallow the rule", () => {
  assert.equal(commencementFor("CORRECTIVE").status, "PENDING_APPROVAL");
});

test("an unknown or missing type waits for approval rather than commencing", () => {
  for (const type of [null, undefined, "", "SOMETHING_NEW"]) {
    assert.equal(commencementFor(type).status, "PENDING_APPROVAL");
  }
});

test("an emergency with no signatures yet is awaiting retrospective approval", () => {
  assert.equal(
    isAwaitingRetrospectiveApproval({ approvalRetrospective: true, approvedAt: null, status: "OPEN" }),
    true,
  );
});

test("once signed, it is no longer awaiting anything", () => {
  assert.equal(
    isAwaitingRetrospectiveApproval({
      approvalRetrospective: true,
      approvedAt: "2026-08-10T09:00:00Z",
      status: "IN_PROGRESS",
    }),
    false,
  );
});

test("a normal work order is never awaiting retrospective approval", () => {
  assert.equal(
    isAwaitingRetrospectiveApproval({ approvalRetrospective: false, approvedAt: null, status: "PENDING_APPROVAL" }),
    false,
  );
  // A null flag is the pre-existing work orders, and must read as "no".
  assert.equal(
    isAwaitingRetrospectiveApproval({ approvalRetrospective: null, approvedAt: null, status: "OPEN" }),
    false,
  );
});

test("a cancelled emergency stops chasing its signatures", () => {
  assert.equal(
    isAwaitingRetrospectiveApproval({ approvalRetrospective: true, approvedAt: null, status: "CANCELLED" }),
    false,
  );
});

test("the age of unsigned emergency paperwork is counted in whole days", () => {
  assert.equal(retrospectiveApprovalAgeDays("2026-08-10T02:00:00Z", "2026-08-10"), 0);
  assert.equal(retrospectiveApprovalAgeDays("2026-08-04T02:00:00Z", "2026-08-11"), 7);
});

test("a missing or malformed created date reads as zero, not as NaN", () => {
  assert.equal(retrospectiveApprovalAgeDays(null, "2026-08-10"), 0);
  assert.equal(retrospectiveApprovalAgeDays(undefined, "2026-08-10"), 0);
  assert.equal(retrospectiveApprovalAgeDays("not a date", "2026-08-10"), 0);
});

test("a future created date never reports negative age", () => {
  assert.equal(retrospectiveApprovalAgeDays("2026-08-20T00:00:00Z", "2026-08-10"), 0);
});
