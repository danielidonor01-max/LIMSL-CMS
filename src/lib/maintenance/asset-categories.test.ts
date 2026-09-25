// src/lib/maintenance/asset-categories.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { isReplannable, categoryCodeFrom } from "./asset-categories";

const TODAY = "2026-09-25";
const row = (over = {}) => ({
  plannedDate: "2026-11-10",
  status: "SCHEDULED",
  workOrderId: null,
  batchId: null,
  deferredAt: null,
  ...over,
});

test("a future activity nobody has touched is replanned", () => {
  assert.equal(isReplannable(row(), TODAY), true);
});

test("an overdue job is never replanned away", () => {
  // It still has to be done. Changing the interval does not make last
  // quarter's missed service stop being missed.
  assert.equal(isReplannable(row({ status: "OVERDUE", plannedDate: "2026-08-01" }), TODAY), false);
  assert.equal(isReplannable(row({ status: "OVERDUE" }), TODAY), false);
});

test("work somebody has started or planned around is left alone", () => {
  assert.equal(isReplannable(row({ workOrderId: "wo1" }), TODAY), false, "a work order was raised");
  assert.equal(isReplannable(row({ batchId: "b1" }), TODAY), false, "it is in a PM batch");
  assert.equal(isReplannable(row({ deferredAt: "2026-09-01" }), TODAY), false, "somebody deferred it");
  assert.equal(isReplannable(row({ status: "RESCHEDULED" }), TODAY), false, "somebody moved it");
  assert.equal(isReplannable(row({ status: "COMPLETED" }), TODAY), false, "it is done");
});

test("today and the past are not replanned", () => {
  assert.equal(isReplannable(row({ plannedDate: TODAY }), TODAY), false);
  assert.equal(isReplannable(row({ plannedDate: "2026-01-15" }), TODAY), false);
});

test("a category code is derived from its name", () => {
  assert.equal(categoryCodeFrom("Excavation Devices"), "EXCAVATION_DEVICES");
  assert.equal(categoryCodeFrom("  Press / Roll / Shear "), "PRESS_ROLL_SHEAR");
  assert.equal(categoryCodeFrom("Cranes & Lifting"), "CRANES_LIFTING");
});
