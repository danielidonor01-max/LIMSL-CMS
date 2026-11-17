// What a PM found, read from the checklist's stored columns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defectOutcome } from "./pm-defect";

test("no defect: nothing ticked, nothing described", () => {
  assert.equal(defectOutcome({ correctiveActionRequired: false, actionDescription: "" }), "NONE");
  assert.equal(defectOutcome({}), "NONE");
  assert.equal(defectOutcome({ correctiveActionRequired: null, actionDescription: "   " }), "NONE");
});

test("fixed during the PM: an action described, nothing still required", () => {
  assert.equal(defectOutcome({ correctiveActionRequired: false, actionDescription: "Reterminated the wire." }), "FIXED");
});

test("still needs a repair whenever corrective action is required", () => {
  assert.equal(defectOutcome({ correctiveActionRequired: true, actionDescription: "Replace the contactor." }), "OPEN");
  assert.equal(defectOutcome({ correctiveActionRequired: true, actionDescription: "" }), "OPEN");
});
