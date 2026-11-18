import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BACKFILLED_PERMIT,
  BACKFILL_TAG,
  backfilledPermitComplete,
  eligibleForBackfill,
  groupIntoBatches,
  isBackfillStep,
  rotateTechnicians,
  type BackfillPlanRow,
} from "@/lib/maintenance/backfill";
import { isFinishedChain } from "@/lib/signoff/finished";
import { STANDING_DOCS } from "@/lib/db/backfill-standing-docs";
import { PPE_REQUIREMENTS } from "@/lib/hse/permit-form";

const row = (over: Partial<BackfillPlanRow> = {}): BackfillPlanRow => ({
  id: "r1",
  equipmentId: "e1",
  category: "WELDING",
  plannedDate: "2026-03-10",
  activityType: "PM",
  status: "OVERDUE",
  batchId: null,
  removedAt: null,
  ...over,
});

test("the backfill leaves CNC Heavy Duty and the retired earthing system alone", () => {
  assert.equal(eligibleForBackfill(row(), "2026-11-18"), true);
  assert.equal(eligibleForBackfill(row({ activityType: "INS" }), "2026-11-18"), true);
  assert.equal(eligibleForBackfill(row({ category: "CNC_HEAVY" }), "2026-11-18"), false);
  assert.equal(eligibleForBackfill(row({ category: "EARTHING" }), "2026-11-18"), false);
  assert.equal(eligibleForBackfill(row({ removedAt: "2026-11-17" }), "2026-11-18"), false);
});

test("the backfill takes only overdue PMs and inspections not yet in a batch", () => {
  assert.equal(eligibleForBackfill(row({ activityType: "CM" }), "2026-11-18"), false);
  assert.equal(eligibleForBackfill(row({ status: "SCHEDULED" }), "2026-11-18"), false);
  assert.equal(eligibleForBackfill(row({ batchId: "b1" }), "2026-11-18"), false);
  assert.equal(eligibleForBackfill(row({ plannedDate: "2026-11-19" }), "2026-11-18"), false);
});

test("a PM and an inspection due the same day stay in separate batches, oldest first", () => {
  const batches = groupIntoBatches([
    row({ id: "a", plannedDate: "2026-09-10", category: "CNC_LIGHT", activityType: "PM" }),
    row({ id: "b", plannedDate: "2026-09-10", category: "CNC_LIGHT", activityType: "INS" }),
    row({ id: "c", plannedDate: "2026-09-10", category: "CNC_LIGHT", equipmentId: "e2", activityType: "PM" }),
    row({ id: "d", plannedDate: "2026-01-27" }),
  ]);
  assert.deepEqual(
    batches.map((b) => [b.plannedDate, b.activityType, b.rows.length]),
    [
      ["2026-01-27", "PM", 1],
      ["2026-09-10", "INS", 1],
      ["2026-09-10", "PM", 2],
    ],
  );
});

test("Daniel works alone before July; from July he and Ajayi alternate", () => {
  assert.deepEqual(
    rotateTechnicians(["2026-01-05", "2026-06-30", "2026-07-01", "2026-07-02", "2026-08-01"], "D", "A"),
    ["D", "D", "A", "D", "A"],
  );
});

test("a backfilled permit closes only when both of its chains are signed", () => {
  const signed = [{ required: true, status: "SIGNED" }, { required: false, status: "PENDING" }];
  const open = [{ required: true, status: "PENDING" }];
  assert.equal(backfilledPermitComplete(signed, signed), true);
  assert.equal(backfilledPermitComplete(signed, open), false);
  assert.equal(backfilledPermitComplete(open, signed), false);
  assert.equal(backfilledPermitComplete([], signed), false);
});

test("a backfilled permit's signatures stay in the inbox, and its clock does not run", () => {
  assert.equal(isFinishedChain("PERMIT", BACKFILLED_PERMIT), false);
  assert.equal(isFinishedChain("PERMIT_CLOSEOUT", BACKFILLED_PERMIT), false);
  const src = readFileSync("src/lib/hse/permit-reconcile.ts", "utf8");
  assert.match(src, /p\.status === BACKFILLED_PERMIT \|\|/);
});

test("the backfill script signs nothing and every step waits for its person", () => {
  const src = readFileSync("src/lib/db/backfill-2026.ts", "utf8");
  assert.match(src, /status: "PENDING" as const/);
  assert.doesNotMatch(src, /status: "SIGNED"/);
  assert.doesNotMatch(src, /bsignedByIdb|bsignedAtb/);
});

test("bulk signing goes through the one signature route and only marks tagged steps", () => {
  const panel = readFileSync("src/components/BackfillSignPanel.tsx", "utf8");
  assert.match(panel, /\/api\/signoffs\/\$\{item\.signoffId\}/);
  assert.equal(isBackfillStep(BACKFILL_TAG), true);
  assert.equal(isBackfillStep("Looks fine"), false);
  assert.equal(isBackfillStep(null), false);
});

test("every drafted hazard analysis names known PPE and has real steps", () => {
  const known = new Set<string>(PPE_REQUIREMENTS.map((p) => p.key));
  for (const [category, doc] of Object.entries(STANDING_DOCS)) {
    assert.ok(doc.hazards.length >= 3, category);
    for (const p of doc.ppe) assert.ok(known.has(p), `${category}: ${p}`);
    for (const h of doc.hazards) {
      assert.ok(h.likelihoodAfter * h.severityAfter <= h.likelihoodBefore * h.severityBefore, `${category}: ${h.step}`);
    }
  }
});
