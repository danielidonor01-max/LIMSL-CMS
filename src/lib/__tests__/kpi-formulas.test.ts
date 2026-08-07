import { test } from "node:test";
import assert from "node:assert/strict";
import {
  availabilityOf,
  ptwComplianceOf,
  medianJobHoursOf,
  backlogHoursOf,
} from "@/lib/kpi/formulas";
import { adherenceWindowFor, adherenceOf, suggestedPmFrequency } from "@/lib/maintenance/adherence";

// ── Availability ─────────────────────────────────────────────────────────────
// The finding: planned downtime was excluded, so a machine stopped all day for a
// PM still reported 100% available — and the metric could be improved simply by
// classifying work as preventive.
test("planned PM downtime reduces availability, not just breakdowns", () => {
  const withPm = availabilityOf(100, 0, 8);
  assert.equal(withPm, 0.92);
  assert.ok(withPm! < 1, "eight hours down for a PM cannot read as fully available");
});

test("availability counts breakdown and planned downtime together", () => {
  assert.equal(availabilityOf(100, 10, 10), 0.8);
});

test("availability cannot be reduced by relabelling breakdown work as preventive", () => {
  // Same 12 hours lost, split differently between the two causes.
  assert.equal(availabilityOf(100, 12, 0), availabilityOf(100, 0, 12));
  assert.equal(availabilityOf(100, 8, 4), availabilityOf(100, 4, 8));
});

test("availability floors at zero and returns null with no planned hours", () => {
  assert.equal(availabilityOf(10, 40, 0), 0);
  assert.equal(availabilityOf(0, 5, 5), null, "no baseline means no honest figure, not 100%");
});

// ── Permit-to-work ───────────────────────────────────────────────────────────
// The finding: the old metric was "approved ÷ raised", and a permit can only
// become ACTIVE through a fully signed chain — so it trended to 100% by
// construction. A safety KPI that cannot go down is not a control.
test("PTW compliance CAN go down — an unclosed permit fails the metric", () => {
  const r = ptwComplianceOf([
    { approvedAt: "2026-01-01", status: "CLOSED" },
    { approvedAt: "2026-01-02", status: "EXPIRED" },
  ]);
  assert.equal(r.compliance, 0.5);
  assert.equal(r.notClosed, 1);
});

test("a late close-out is recorded but does not count as compliant", () => {
  const r = ptwComplianceOf([
    { approvedAt: "2026-01-01", status: "CLOSED" },
    { approvedAt: "2026-01-02", status: "CLOSED_LATE" },
  ]);
  assert.equal(r.compliance, 0.5);
  assert.equal(r.closedLate, 1);
  assert.equal(r.wentToWork, 2);
});

test("permits that never authorised work are outside the metric entirely", () => {
  const r = ptwComplianceOf([
    { approvedAt: null, status: "DRAFT" },
    { approvedAt: null, status: "PENDING" },
    { approvedAt: "2026-01-03", status: "CANCELLED" },
    { approvedAt: "2026-01-04", status: "CLOSED" },
  ]);
  assert.equal(r.wentToWork, 1, "only approved, non-cancelled permits sent anyone to work");
  assert.equal(r.compliance, 1);
});

test("no permits gives null rather than a flattering 100%", () => {
  assert.equal(ptwComplianceOf([]).compliance, null);
});

// ── Labour hours & backlog ───────────────────────────────────────────────────
// The finding: actualDuration was written by no path, so backlog was
// openWOs x 2h presented as a man-hour measurement.
test("backlog falls back to this workshop's median job, not a hardcoded 2h", () => {
  const median = medianJobHoursOf([6, 6, 6, 8, 6]);
  assert.equal(median, 6);
  const b = backlogHoursOf([{}, {}], median);
  assert.equal(b.hours, 12);
  assert.equal(b.estimated, 0, "neither row carried a real estimate and the caller must know");
});

test("median ignores missing and zero durations", () => {
  assert.equal(medianJobHoursOf([null, undefined, 0, 4, 4, 4]), 4);
});

test("with no completed work at all the fallback is still sane", () => {
  assert.equal(medianJobHoursOf([]), 2);
  assert.equal(medianJobHoursOf([null, 0]), 2);
});

test("a real estimate always beats the fallback, and is counted", () => {
  const b = backlogHoursOf([{ estimatedDuration: 10 }, {}], 3);
  assert.equal(b.hours, 13);
  assert.equal(b.estimated, 1);
  assert.equal(b.total, 2);
});

// ── Frequency casing ─────────────────────────────────────────────────────────
// Legacy Excel imports carry "Weekly"; equipment created before the enum settled
// carries "Quarterly". Matching literally sent both to the 14-day default, so a
// weekly PM twelve days late scored as compliant.
test("mixed-case frequencies get their real adherence window", () => {
  assert.equal(adherenceWindowFor("Weekly"), 3);
  assert.equal(adherenceWindowFor(" quarterly "), 14);
  assert.equal(adherenceWindowFor("Annual"), 30);
  // The bug this closes: twelve days late on a weekly PM.
  assert.equal(adherenceOf("2026-03-02", "2026-03-14", "Weekly").compliant, false);
});

test("mixed-case criticality still drives the PM strategy", () => {
  assert.equal(suggestedPmFrequency("Critical"), "MONTHLY");
  assert.equal(suggestedPmFrequency(" low "), "SEMI_ANNUAL");
});
