import { test } from "node:test";
import assert from "node:assert/strict";
import {
  stockLevelOf,
  reorderQuantity,
  spareRisk,
  applyMovement,
  STOCK_LEVEL_LABELS,
  STOCK_LEVEL_BADGE,
} from "@/lib/maintenance/spares";

test("stock levels distinguish empty, short, exactly-at and adequate", () => {
  assert.equal(stockLevelOf(0, 2), "OUT_OF_STOCK");
  assert.equal(stockLevelOf(1, 2), "BELOW_MINIMUM");
  assert.equal(stockLevelOf(2, 2), "AT_MINIMUM");
  assert.equal(stockLevelOf(5, 2), "ADEQUATE");
});

// Inventing a shortfall against a minimum nobody set would fill the at-risk
// list with noise on day one and teach everyone to ignore it.
test("with no minimum set, having stock is adequate rather than a shortfall", () => {
  assert.equal(stockLevelOf(1, 0), "ADEQUATE");
  assert.equal(stockLevelOf(0, 0), "OUT_OF_STOCK", "no stock is still no stock");
});

test("negative and malformed quantities never produce a level", () => {
  assert.equal(stockLevelOf(-3, 2), "OUT_OF_STOCK");
  assert.equal(stockLevelOf(NaN, 2), "OUT_OF_STOCK");
  assert.equal(stockLevelOf(4, NaN), "ADEQUATE");
});

test("every level has a label and a badge", () => {
  for (const l of ["OUT_OF_STOCK", "BELOW_MINIMUM", "AT_MINIMUM", "ADEQUATE"] as const) {
    assert.ok(STOCK_LEVEL_LABELS[l]?.length > 0);
    assert.ok(STOCK_LEVEL_BADGE[l]?.length > 0);
  }
});

test("reorder tops up to the maximum, or to the minimum when none is set", () => {
  assert.equal(reorderQuantity(1, 2, 6), 5);
  assert.equal(reorderQuantity(1, 2, null), 1);
  assert.equal(reorderQuantity(4, 2, 6), 2);
  assert.equal(reorderQuantity(8, 2, 6), 0, "already above the maximum needs nothing");
  // A maximum below the minimum is a data-entry error; fall back to the minimum.
  assert.equal(reorderQuantity(0, 5, 2), 5);
});

// The point of the whole feature.
test("a critical machine with no spare reports the outage it is already booked for", () => {
  const r = spareRisk({
    quantityOnHand: 0,
    minimumQuantity: 1,
    leadTimeDays: 21,
    equipmentCriticality: "CRITICAL",
    equipmentName: "CNC Plasma Cutter",
  });
  assert.equal(r.atRisk, true);
  assert.equal(r.severity, "high");
  assert.equal(r.exposureDays, 21, "a failure today costs the whole lead time");
  assert.match(r.headline, /21 days down/);
  assert.match(r.headline, /CNC Plasma Cutter/);
});

test("below minimum still has cover, so exposure is zero but it is still at risk", () => {
  const r = spareRisk({ quantityOnHand: 1, minimumQuantity: 3, leadTimeDays: 30, equipmentCriticality: "CRITICAL" });
  assert.equal(r.atRisk, true);
  assert.equal(r.exposureDays, 0, "there is one on the shelf — the machine does not stop today");
  assert.match(r.headline, /Below minimum/);
});

test("criticality separates a stopped production line from a spare bench grinder", () => {
  const base = { quantityOnHand: 0, minimumQuantity: 1, leadTimeDays: 14 };
  const critical = spareRisk({ ...base, equipmentCriticality: "CRITICAL" });
  const low = spareRisk({ ...base, equipmentCriticality: "LOW" });
  assert.equal(critical.severity, "high");
  assert.equal(low.severity, "low");
});

test("on order lowers the grade where there is still cover on the shelf", () => {
  const notOrdered = spareRisk({ quantityOnHand: 1, minimumQuantity: 3, equipmentCriticality: "CRITICAL" });
  const ordered = spareRisk({ quantityOnHand: 1, minimumQuantity: 3, equipmentCriticality: "CRITICAL", onOrder: true });
  assert.equal(ordered.atRisk, true, "on order is not the same as in stock");
  assert.notEqual(ordered.severity, notOrdered.severity);
});

// A purchase order is not a spare. If the machine fails this afternoon the wait
// is identical whether or not someone has raised a PO, so the grade must not
// soften — that would be the register telling a comfortable lie.
test("on order does NOT downgrade a critical part that is entirely absent", () => {
  const notOrdered = spareRisk({ quantityOnHand: 0, minimumQuantity: 1, leadTimeDays: 30, equipmentCriticality: "CRITICAL" });
  const ordered = spareRisk({ quantityOnHand: 0, minimumQuantity: 1, leadTimeDays: 30, equipmentCriticality: "CRITICAL", onOrder: true });
  assert.equal(notOrdered.severity, "high");
  assert.equal(ordered.severity, "high");
  assert.equal(ordered.exposureDays, 30);
});

test("adequate stock is not at risk and carries no exposure", () => {
  const r = spareRisk({ quantityOnHand: 10, minimumQuantity: 2, leadTimeDays: 60, equipmentCriticality: "CRITICAL" });
  assert.equal(r.atRisk, false);
  assert.equal(r.severity, "none");
  assert.equal(r.exposureDays, 0);
});

test("an unrecorded lead time is said out loud rather than shown as zero days", () => {
  const r = spareRisk({ quantityOnHand: 0, minimumQuantity: 1, equipmentCriticality: "HIGH" });
  assert.match(r.headline, /no lead time recorded/i);
});

// ── Movements ────────────────────────────────────────────────────────────────
test("receipts add and issues subtract, reporting the new balance", () => {
  const rec = applyMovement(2, "RECEIPT", 3);
  assert.deepEqual(rec, { ok: true, balanceAfter: 5, delta: 3 });
  const iss = applyMovement(5, "ISSUE", 2);
  assert.deepEqual(iss, { ok: true, balanceAfter: 3, delta: -2 });
});

// A negative balance is always a recording error, and accepting it destroys the
// one number this register exists to hold.
test("you cannot issue more than is on the shelf", () => {
  const r = applyMovement(1, "ISSUE", 4);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.error.includes("Only 1 in stock"), true);
});

test("an adjustment sets the counted figure rather than moving by an amount", () => {
  const up = applyMovement(2, "ADJUSTMENT", 7);
  assert.deepEqual(up, { ok: true, balanceAfter: 7, delta: 5 });
  const down = applyMovement(9, "ADJUSTMENT", 4);
  assert.deepEqual(down, { ok: true, balanceAfter: 4, delta: -5 });
});

test("zero, negative, malformed and unknown movements are refused", () => {
  for (const q of [0, -2, NaN, Infinity]) {
    assert.equal(applyMovement(5, "RECEIPT", q).ok, false, `${q} is not a quantity`);
  }
  assert.equal(applyMovement(5, "TELEPORT", 1).ok, false);
});
