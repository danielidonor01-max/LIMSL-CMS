import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessReadiness,
  readinessSummary,
  drillProgrammeStatus,
  drillFollowUp,
  intervalFor,
  EMERGENCY_TYPE_LABELS,
  DRILL_TYPE_LABELS,
} from "@/lib/hse/emergency";

const TODAY = "2026-08-08";

// The sentence this register exists to stop being true: "we have forty fire
// extinguishers." Presence is not readiness.
test("an extinguisher that is present but expired is not ready", () => {
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "2026-08-01", expiryDate: "2026-06-01" },
    TODAY,
  );
  assert.equal(r.ready, false);
  assert.equal(r.expiry, "EXPIRED");
  assert.equal(r.severity, "fail");
  assert.match(r.reasons.join(" "), /Expired/);
});

test("an item never inspected is not ready, however new it looks", () => {
  const r = assessReadiness({ type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: null }, TODAY);
  assert.equal(r.ready, false);
  assert.equal(r.inspection, "NEVER_INSPECTED");
  assert.match(r.reasons.join(" "), /no evidence it works/i);
});

// Fixing one problem must not make an item look ready when another remains.
test("every reason is reported, not just the first", () => {
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "DEFECTIVE", lastInspectionDate: "2025-01-01", expiryDate: "2026-01-01" },
    TODAY,
  );
  assert.equal(r.ready, false);
  assert.equal(r.reasons.length, 3, "overdue, expired and defective are three separate problems");
});

test("a serviceable, in-date, recently inspected item is ready", () => {
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "2026-08-01", expiryDate: "2027-06-01" },
    TODAY,
  );
  assert.equal(r.ready, true);
  assert.equal(r.severity, "ok");
  assert.deepEqual(r.reasons, []);
});

test("approaching its interval warns without claiming it has failed", () => {
  // 30-day interval, inspected 26 days ago → past the 80% mark.
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "2026-07-13", expiryDate: "2027-01-01" },
    TODAY,
  );
  assert.equal(r.ready, true, "still serviceable today");
  assert.equal(r.severity, "warn");
  assert.equal(r.inspection, "DUE_SOON");
});

test("expiry inside a month warns; expiry passed fails", () => {
  const soon = assessReadiness(
    { type: "FIRST_AID_KIT", status: "SERVICEABLE", lastInspectionDate: TODAY, expiryDate: "2026-08-20" },
    TODAY,
  );
  assert.equal(soon.expiry, "EXPIRING_SOON");
  assert.equal(soon.ready, true);
  assert.equal(soon.severity, "warn");

  const gone = assessReadiness(
    { type: "FIRST_AID_KIT", status: "SERVICEABLE", lastInspectionDate: TODAY, expiryDate: "2026-08-07" },
    TODAY,
  );
  assert.equal(gone.expiry, "EXPIRED");
  assert.equal(gone.ready, false);
});

test("an item with no expiry date is not treated as expired", () => {
  const r = assessReadiness({ type: "FIRE_ALARM", status: "SERVICEABLE", lastInspectionDate: TODAY }, TODAY);
  assert.equal(r.expiry, "NONE");
  assert.equal(r.ready, true);
});

test("defective and missing are each disqualifying on their own", () => {
  for (const status of ["DEFECTIVE", "MISSING"]) {
    const r = assessReadiness(
      { type: "EYE_WASH", status, lastInspectionDate: TODAY, expiryDate: "2030-01-01" },
      TODAY,
    );
    assert.equal(r.ready, false, `${status} must not be ready`);
  }
});

// Counting a retired item as a failure pushes people to delete records rather
// than retire them, which loses exactly the history an auditor asks for.
test("a withdrawn item is not ready, but is not a failure either", () => {
  const r = assessReadiness({ type: "FIRE_EXTINGUISHER", status: "REMOVED", lastInspectionDate: null }, TODAY);
  assert.equal(r.ready, false);
  assert.equal(r.severity, "ok");
});

test("each type carries its own inspection interval, and unknown types get a default", () => {
  assert.equal(intervalFor("EYE_WASH"), 7, "an eye wash is checked weekly");
  assert.equal(intervalFor("FIRE_EXTINGUISHER"), 30);
  assert.equal(intervalFor("nonsense"), 90);
  assert.equal(intervalFor(null), 90);
});

test("an explicit interval overrides the type default", () => {
  // Inspected 40 days ago: overdue on the 30-day default, fine on a 90-day override.
  const base = { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "2026-06-29" };
  assert.equal(assessReadiness(base, TODAY).inspection, "OVERDUE");
  assert.equal(assessReadiness({ ...base, inspectionIntervalDays: 90 }, TODAY).inspection, "OK");
});

test("malformed dates do not crash and do not silently pass", () => {
  const r = assessReadiness(
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "not-a-date", expiryDate: "rubbish" },
    TODAY,
  );
  assert.equal(r.ready, false);
  assert.equal(r.inspection, "NEVER_INSPECTED");
});

test("every type and drill type has a label", () => {
  for (const v of Object.values(EMERGENCY_TYPE_LABELS)) assert.ok(v.length > 0);
  for (const v of Object.values(DRILL_TYPE_LABELS)) assert.ok(v.length > 0);
});

// ── The headline figure ──────────────────────────────────────────────────────
test("the summary reports readiness, not a headcount", () => {
  const items = [
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "2026-08-01", expiryDate: "2027-01-01" },
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: "2026-08-01", expiryDate: "2026-01-01" }, // expired
    { type: "FIRE_EXTINGUISHER", status: "DEFECTIVE", lastInspectionDate: "2026-08-01", expiryDate: "2027-01-01" },
    { type: "FIRE_EXTINGUISHER", status: "SERVICEABLE", lastInspectionDate: null, expiryDate: "2027-01-01" }, // never inspected
  ];
  const s = readinessSummary(items, TODAY);
  assert.equal(s.total, 4);
  assert.equal(s.ready, 1, "only one of the four can actually be relied on");
  assert.equal(s.notReady, 3);
  assert.equal(s.percent, 25);
});

test("withdrawn items leave the denominator rather than dragging it down", () => {
  const s = readinessSummary(
    [
      { type: "AED", status: "SERVICEABLE", lastInspectionDate: "2026-08-01", expiryDate: "2027-01-01" },
      { type: "AED", status: "REMOVED", lastInspectionDate: null },
    ],
    TODAY,
  );
  assert.equal(s.total, 2);
  assert.equal(s.inService, 1);
  assert.equal(s.percent, 100);
});

test("an empty register reports null rather than a flattering 100%", () => {
  assert.equal(readinessSummary([], TODAY).percent, null);
});

// ── Drill programme ──────────────────────────────────────────────────────────
test("a drill programme is judged on interval, not on whether one ever happened", () => {
  const overdue = drillProgrammeStatus([{ drillDate: "2024-01-15", drillType: "FIRE_EVACUATION" }], 365, TODAY);
  assert.equal(overdue.status, "OVERDUE");
  assert.equal(overdue.lastDrillDate, "2024-01-15");
  assert.ok((overdue.daysSince ?? 0) > 365);

  const ok = drillProgrammeStatus([{ drillDate: "2026-06-01", drillType: "FIRE_EVACUATION" }], 365, TODAY);
  assert.equal(ok.status, "OK");
  assert.equal(ok.nextDueDate, "2027-06-01");
});

test("the most recent drill is what counts, whatever order they arrive in", () => {
  const r = drillProgrammeStatus(
    [
      { drillDate: "2024-02-01", drillType: "FIRE_EVACUATION" },
      { drillDate: "2026-07-01", drillType: "FIRE_EVACUATION" },
      { drillDate: "2025-03-01", drillType: "FIRE_EVACUATION" },
    ],
    365,
    TODAY,
  );
  assert.equal(r.lastDrillDate, "2026-07-01");
  assert.equal(r.status, "OK");
});

test("no drills ever is NEVER, distinct from overdue", () => {
  const r = drillProgrammeStatus([], 365, TODAY);
  assert.equal(r.status, "NEVER");
  assert.equal(r.lastDrillDate, null);
  assert.equal(r.nextDueDate, null);
});

test("approaching the required interval warns before it lapses", () => {
  // 365-day interval, last drill 300 days ago → past the 80% mark.
  const r = drillProgrammeStatus([{ drillDate: "2025-10-12", drillType: "FIRE_EVACUATION" }], 365, TODAY);
  assert.equal(r.status, "DUE_SOON");
});

// A drill that found problems and closed none taught the organisation nothing.
test("drills that surfaced deficiencies but recorded no action are counted", () => {
  const f = drillFollowUp([
    { deficiencies: "Two exits blocked by stock", correctiveActions: "Stock relocated 12/06" },
    { deficiencies: "Assembly point roll-call took 9 minutes", correctiveActions: "" },
    { deficiencies: "", correctiveActions: "" },
    { deficiencies: "   ", correctiveActions: null },
  ]);
  assert.equal(f.withDeficiencies, 2);
  assert.equal(f.unresolved, 1);
});
