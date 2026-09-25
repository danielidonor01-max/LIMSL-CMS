// src/lib/maintenance/flow.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pmFlowState, cmFlowState, canTake, cmNeedsAuthorisation, repairAuthorisers, PM_FLOW, CM_FLOW } from "./flow";

test("a PM with nothing done is waiting on its batch", () => {
  const s = pmFlowState({});
  assert.equal(s.currentIndex, 0);
  assert.equal(s.current?.key, "BATCH");
  assert.deepEqual(s.done, []);
});

test("raising the batch moves it on to assignment, and no further", () => {
  const s = pmFlowState({ batchId: "b1" });
  assert.equal(s.current?.key, "ASSIGN");
  assert.deepEqual(s.done, ["BATCH"]);
});

test("the flow is a sequence, so a later document does not count while an earlier one is missing", () => {
  // This is the whole point. A permit that exists without an approved method
  // statement must not read as progress — it reads as the job still being
  // stuck at the method statement, which is where somebody has to act.
  const s = pmFlowState({
    batchId: "b1",
    assignedToId: "u1",
    workOrderCount: 5,
    wmsStatus: "UNDER_REVIEW",
    jhaStatus: "APPROVED",
    permitStatus: "ACTIVE",
  });
  assert.equal(s.current?.key, "WMS");
  assert.ok(!s.done.includes("PERMIT"));
});

test("an unapproved method statement does not satisfy its step", () => {
  for (const status of ["DRAFT", "UNDER_REVIEW", "REJECTED", "SUPERSEDED"]) {
    const s = pmFlowState({ batchId: "b", assignedToId: "u", workOrderCount: 1, wmsStatus: status });
    assert.equal(s.current?.key, "WMS", `${status} should not pass the WMS step`);
  }
});

test("a permit counts as raised while it is still collecting its own signatures", () => {
  // It would otherwise tell HSE to raise a second permit for the same job,
  // because the first one is not ACTIVE yet.
  const base = {
    batchId: "b",
    assignedToId: "u",
    workOrderCount: 5,
    wmsStatus: "APPROVED",
    jhaStatus: "APPROVED",
  };
  assert.equal(pmFlowState({ ...base, permitStatus: "PENDING_APPROVAL" }).current?.key, "WORK");
  assert.equal(pmFlowState({ ...base, permitStatus: "ACTIVE" }).current?.key, "WORK");
});

test("a refused or cancelled permit does not authorise work", () => {
  const base = {
    batchId: "b",
    assignedToId: "u",
    workOrderCount: 5,
    wmsStatus: "APPROVED",
    jhaStatus: "APPROVED",
  };
  assert.equal(pmFlowState({ ...base, permitStatus: "REJECTED" }).current?.key, "PERMIT");
  assert.equal(pmFlowState({ ...base, permitStatus: "CANCELLED" }).current?.key, "PERMIT");
});

test("a finished PM has no current step", () => {
  const s = pmFlowState({
    batchId: "b",
    assignedToId: "u",
    workOrderCount: 5,
    wmsStatus: "APPROVED",
    jhaStatus: "APPROVED",
    permitStatus: "ACTIVE",
    completed: true,
  });
  assert.equal(s.current, null);
  assert.equal(s.currentIndex, PM_FLOW.length);
});

test("a reported fault is waiting on the Factory Manager, not on an assignment", () => {
  const s = cmFlowState({});
  assert.equal(s.current?.key, "MOTION");
  assert.deepEqual(s.done, ["REPORT"]);
});

test("a CM cannot skip authorisation by naming somebody", () => {
  // Assigning without the repair being agreed would let a foreman start a job
  // the Factory Manager has not signed off.
  const s = cmFlowState({ assignedToId: "u1" });
  assert.equal(s.current?.key, "MOTION");
});

test("the CM chain runs report, motion, assign, work order, WMS, JHA, permit, work", () => {
  assert.deepEqual(
    CM_FLOW.map((s) => s.key),
    ["REPORT", "MOTION", "ASSIGN", "WORK_ORDER", "WMS", "JHA", "PERMIT", "WORK"],
  );
});

test("the PM chain puts the batch and its assignment before any document", () => {
  assert.deepEqual(
    PM_FLOW.map((s) => s.key),
    ["BATCH", "ASSIGN", "WORK_ORDER", "WMS", "JHA", "PERMIT", "WORK"],
  );
});

test("HSE raises the permit, and a technician cannot", () => {
  const permitStep = PM_FLOW.find((s) => s.key === "PERMIT")!;
  assert.ok(canTake(permitStep, "HSE"));
  assert.ok(!canTake(permitStep, "TECHNICIAN"));
  assert.ok(!canTake(permitStep, "FOREMAN"));
});

test("assigning a batch is a foreman's act and above", () => {
  const assign = PM_FLOW.find((s) => s.key === "ASSIGN")!;
  assert.ok(canTake(assign, "FOREMAN"));
  assert.ok(canTake(assign, "MAINTENANCE_MANAGER"));
  assert.ok(!canTake(assign, "TECHNICIAN"));
  assert.ok(!canTake(assign, "VIEWER"));
});

test("the Factory Manager moves a repair to the Foreman, and the Foreman does not move it himself", () => {
  const motion = CM_FLOW.find((s) => s.key === "MOTION")!;
  assert.ok(canTake(motion, "FACTORY_MANAGER"));
  assert.ok(!canTake(motion, "FOREMAN"));
  assert.ok(!canTake(motion, "TECHNICIAN"));
});

test("a step with no roles is open to the people already on the job", () => {
  const work = PM_FLOW.find((s) => s.key === "WORK")!;
  assert.ok(canTake(work, "TECHNICIAN"));
  assert.ok(canTake(work, "FOREMAN"));
});

test("nobody can take a step that does not exist", () => {
  assert.ok(!canTake(null, "SUPER_ADMIN"));
});

test("every step says who it is for and why it exists", () => {
  // The rail shows `because` to whoever is blocked by a step. A blank one is a
  // screen that says "you cannot proceed" and nothing else.
  for (const step of [...PM_FLOW, ...CM_FLOW]) {
    assert.ok(step.action.trim().length > 0, `${step.key} has no action`);
    assert.ok(step.because.trim().length > 0, `${step.key} has no reason`);
    assert.ok(step.label.trim().length > 0, `${step.key} has no label`);
  }
});

test("a reported fault always needs the Factory Manager", () => {
  assert.equal(cmNeedsAuthorisation({ origin: "REPORTED" }), true);
  assert.equal(cmNeedsAuthorisation({}), true, "unknown origin is treated as reported");
});

test("a foreman's scheduled repair does not, below the threshold", () => {
  // Making him queue for a signature to do his own planned job is the kind of
  // control that gets worked around rather than followed.
  assert.equal(cmNeedsAuthorisation({ origin: "SCHEDULED", urgency: "MEDIUM" }), false);
  assert.equal(cmNeedsAuthorisation({ origin: "SCHEDULED", urgency: "HIGH" }), false);
});

test("critical work goes up whatever its origin", () => {
  assert.equal(cmNeedsAuthorisation({ origin: "SCHEDULED", urgency: "CRITICAL" }), true);
  assert.equal(
    cmNeedsAuthorisation({ origin: "SCHEDULED", urgency: "LOW", equipmentCriticality: "CRITICAL" }),
    true,
    "a critical machine raises the bar even for a low-urgency job",
  );
});

test("a scheduled repair below the threshold starts at assignment", () => {
  const s = cmFlowState({ origin: "SCHEDULED", urgency: "MEDIUM" });
  assert.equal(s.current?.key, "ASSIGN");
  assert.ok(s.done.includes("MOTION"));
});

test("a scheduled repair on a critical machine still waits for the Factory Manager", () => {
  const s = cmFlowState({ origin: "SCHEDULED", urgency: "LOW", equipmentCriticality: "CRITICAL" });
  assert.equal(s.current?.key, "MOTION");
});

test("a routine repair may be authorised by the Maintenance Manager or the Foreman", () => {
  const roles = repairAuthorisers({ urgency: "MEDIUM", equipmentCriticality: "HIGH" });
  assert.ok(roles.includes("FACTORY_MANAGER"));
  assert.ok(roles.includes("MAINTENANCE_MANAGER"));
  assert.ok(roles.includes("FOREMAN"));
  assert.ok(!roles.includes("TECHNICIAN"), "the person reporting it never authorises it");
});

test("a critical repair stays with the Factory Manager", () => {
  for (const facts of [{ urgency: "CRITICAL" }, { urgency: "LOW", equipmentCriticality: "CRITICAL" }]) {
    const roles = repairAuthorisers(facts);
    assert.ok(roles.includes("FACTORY_MANAGER"));
    assert.ok(!roles.includes("FOREMAN") && !roles.includes("MAINTENANCE_MANAGER"), JSON.stringify(facts));
  }
});

test("the rail offers the authorise step to whoever the threshold allows", () => {
  const routine = cmFlowState({ urgency: "MEDIUM" }).current!;
  assert.equal(routine.key, "MOTION");
  assert.ok(canTake(routine, "FOREMAN"));
  const critical = cmFlowState({ urgency: "CRITICAL" }).current!;
  assert.ok(!canTake(critical, "FOREMAN"));
  assert.ok(canTake(critical, "FACTORY_MANAGER"));
});
