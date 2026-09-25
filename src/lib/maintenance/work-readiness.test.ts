// src/lib/maintenance/work-readiness.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readinessToWork, type ReadinessInput } from "./work-readiness";

const base = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  today: "2026-09-25",
  workOrder: { workOrderNumber: "WO-2026-0040", status: "OPEN" },
  wms: { status: "APPROVED", wmsNumber: "WMS-2026-0004", revision: 1 },
  jha: { status: "APPROVED", jhaNumber: "JHA-2026-0001", wmsRevision: 1 },
  permit: { status: "ACTIVE", permitNumber: "PTW-2026-0001", startDate: "2026-09-25", validityDays: 7, renewalDays: null },
  ...over,
});

test("with every document signed, work may start on the permit's first day", () => {
  const r = readinessToWork(base());
  assert.equal(r.ok, true);
  assert.equal(r.firstBlocker, null);
});

test("no work order, no work", () => {
  const r = readinessToWork(base({ workOrder: null }));
  assert.equal(r.ok, false);
  assert.equal(r.firstBlocker?.key, "WORK_ORDER");
});

test("an unapproved, rejected or cancelled work order stops work", () => {
  for (const status of ["PENDING_APPROVAL", "REJECTED", "CANCELLED", "COMPLETED"]) {
    const r = readinessToWork(base({ workOrder: { status } }));
    assert.equal(r.firstBlocker?.key, "WORK_ORDER", status);
  }
});

test("an emergency may start before its signatures, but not without a permit", () => {
  const signedEmergency = readinessToWork(base({ workOrder: { status: "OPEN", approvalRetrospective: true } }));
  assert.equal(signedEmergency.ok, true, "the standing emergency exception covers the work order only");
  const noPermit = readinessToWork(base({ workOrder: { status: "OPEN", approvalRetrospective: true }, permit: null }));
  assert.equal(noPermit.firstBlocker?.key, "PERMIT");
});

test("no permit, no work", () => {
  const r = readinessToWork(base({ permit: null }));
  assert.equal(r.firstBlocker?.key, "PERMIT");
});

test("a permit that is raised but not fully signed is not a permit to work", () => {
  const r = readinessToWork(base({ permit: { ...base().permit!, status: "PENDING_APPROVAL" } }));
  assert.equal(r.firstBlocker?.key, "PERMIT");
});

test("an unapproved method statement or hazard analysis stops work", () => {
  assert.equal(readinessToWork(base({ wms: { status: "UNDER_REVIEW" } })).firstBlocker?.key, "WMS");
  assert.equal(readinessToWork(base({ wms: null })).firstBlocker?.key, "WMS");
  assert.equal(readinessToWork(base({ jha: { status: "UNDER_REVIEW" } })).firstBlocker?.key, "JHA");
  assert.equal(readinessToWork(base({ jha: null })).firstBlocker?.key, "JHA");
});

test("a hazard analysis written for an earlier method revision stops work", () => {
  const r = readinessToWork(base({ wms: { status: "APPROVED", revision: 2 }, jha: { status: "APPROVED", wmsRevision: 1 } }));
  assert.equal(r.firstBlocker?.key, "JHA");
});

test("the day after the permit starts, work waits for today's revalidation", () => {
  const r = readinessToWork(base({ today: "2026-09-26" }));
  assert.equal(r.ok, false);
  assert.equal(r.firstBlocker?.key, "REVALIDATED");
  assert.equal(r.needsRevalidation, true, "this is the one thing the technician can ask for");
});

test("once today is revalidated, work may start", () => {
  const renewalDays = JSON.stringify({
    "2026-09-26": { date: "2026-09-26", status: "WORKED", time: "07:30", signedByName: "Kingsley Iworah" },
  });
  const r = readinessToWork(base({ today: "2026-09-26", permit: { ...base().permit!, renewalDays } }));
  assert.equal(r.ok, true);
  assert.match(r.checks.find((c) => c.key === "REVALIDATED")!.detail, /Kingsley Iworah/);
});

test("yesterday's revalidation does not cover today", () => {
  const renewalDays = { "2026-09-26": { date: "2026-09-26", status: "WORKED" as const, time: "07:30" } };
  const r = readinessToWork(base({ today: "2026-09-27", permit: { ...base().permit!, renewalDays } }));
  assert.equal(r.firstBlocker?.key, "REVALIDATED");
});

test("a day marked as not worked is not a day revalidated", () => {
  const renewalDays = { "2026-09-26": { date: "2026-09-26", status: "NOT_WORKED" as const } };
  const r = readinessToWork(base({ today: "2026-09-26", permit: { ...base().permit!, renewalDays } }));
  assert.equal(r.firstBlocker?.key, "REVALIDATED");
});

test("an expired window stops work even with a signature for the day", () => {
  const r = readinessToWork(base({ today: "2026-10-05" }));
  assert.equal(r.firstBlocker?.key, "PERMIT_WINDOW");
  assert.equal(r.needsRevalidation, false, "revalidation cannot rescue an expired permit");
});

test("every condition is listed, met or not, so the screen can show the whole picture", () => {
  const r = readinessToWork(base({ permit: null, jha: null }));
  assert.deepEqual(
    r.checks.map((c) => c.key),
    ["WORK_ORDER", "WMS", "JHA", "PERMIT", "PERMIT_WINDOW", "REVALIDATED"],
  );
  assert.ok(r.checks.every((c) => c.detail.length > 10), "each says why");
});
