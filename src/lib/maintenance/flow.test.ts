// src/lib/maintenance/flow.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { pmFlowState, cmFlowState, canTake, PM_FLOW, CM_FLOW } from "./flow";

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
