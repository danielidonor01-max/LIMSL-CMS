import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adherenceOf,
  adherenceWindowFor,
  daysBetween,
  suggestedPmFrequency,
  suggestedWoPriority,
  escalationLeadDaysFor,
} from "@/lib/maintenance/adherence";
import { failureModesFor, isFailureMode, failureModeLabel, FAILURE_MODES, DETECTION_METHODS } from "@/lib/maintenance/failure-codes";

// The finding: "completed" said nothing about WHEN, so a PM planned in January
// and done in June counted as fully compliant — the headline ISO metric could
// not be failed.
test("a PM done long after its planned date is NOT compliant", () => {
  const r = adherenceOf("2026-01-05", "2026-06-30", "MONTHLY");
  assert.equal(r.verdict, "MISSED");
  assert.equal(r.compliant, false);
  assert.ok(r.daysLate > 170);
});

test("on time and early both count as on time", () => {
  assert.equal(adherenceOf("2026-03-10", "2026-03-10", "MONTHLY").verdict, "ON_TIME");
  assert.equal(adherenceOf("2026-03-10", "2026-03-04", "MONTHLY").verdict, "ON_TIME");
  assert.ok(adherenceOf("2026-03-10", "2026-03-04", "MONTHLY").daysLate < 0);
});

test("the window scales with frequency — a week late means different things", () => {
  // Five days late: nearly a whole cycle on a weekly task, trivial on an annual.
  assert.equal(adherenceOf("2026-03-02", "2026-03-07", "WEEKLY").compliant, false);
  assert.equal(adherenceOf("2026-03-02", "2026-03-07", "ANNUAL").compliant, true);
  assert.ok(adherenceWindowFor("WEEKLY") < adherenceWindowFor("ANNUAL"));
});

test("late but inside the window is still adherent, and says so", () => {
  const r = adherenceOf("2026-03-01", "2026-03-06", "MONTHLY"); // window 7
  assert.equal(r.verdict, "LATE_WITHIN_WINDOW");
  assert.equal(r.compliant, true);
  assert.equal(r.daysLate, 5);
});

test("an unknown or missing frequency still gets a sane window", () => {
  assert.equal(adherenceWindowFor(null), 14);
  assert.equal(adherenceWindowFor("NOT_A_FREQUENCY"), 14);
  assert.equal(adherenceOf("2026-03-01", "2026-03-10", null).compliant, true);
  assert.equal(adherenceOf("2026-03-01", "2026-04-30", null).compliant, false);
});

test("daysBetween handles malformed dates without throwing", () => {
  assert.equal(daysBetween("not-a-date", "2026-03-01"), 0);
  assert.equal(daysBetween("2026-03-01", ""), 0);
  assert.equal(daysBetween("2026-03-01", "2026-03-31"), 30);
});

// Criticality was stored, badged in four colours, and consumed by nothing.
test("criticality drives frequency, priority and escalation lead", () => {
  assert.equal(suggestedPmFrequency("CRITICAL"), "MONTHLY");
  assert.equal(suggestedPmFrequency("LOW"), "SEMI_ANNUAL");
  assert.equal(suggestedWoPriority("CRITICAL"), "CRITICAL");
  assert.ok(escalationLeadDaysFor("CRITICAL") > escalationLeadDaysFor("LOW"));
  // Unknown criticality must not crash or escalate wildly.
  assert.equal(suggestedPmFrequency(null), "QUARTERLY");
  assert.equal(suggestedWoPriority("NONSENSE"), "MEDIUM");
});

// ── Failure taxonomy ─────────────────────────────────────────────────────────
test("failure modes narrow to the fault type but always allow 'not determined'", () => {
  const electrical = failureModesFor("ELECTRICAL");
  assert.ok(electrical.some((m) => m.code === "CONTACT_FAILURE"));
  assert.ok(electrical.some((m) => m.code === "UNKNOWN"), "an honest 'not determined' must always be offered");
  assert.ok(electrical.length < FAILURE_MODES.length, "an electrical fault should not list every mode");

  // An unrecognised fault type falls back to the full list rather than nothing.
  assert.equal(failureModesFor("NOT_A_TYPE").length, FAILURE_MODES.length);
  assert.equal(failureModesFor(null).length > 0, true);
});

test("failure codes are unique, labelled, and recognisable", () => {
  const codes = FAILURE_MODES.map((m) => m.code);
  assert.equal(new Set(codes).size, codes.length, "duplicate failure code");
  for (const m of FAILURE_MODES) {
    assert.ok(m.label.trim().length > 0, `${m.code} has no label`);
    assert.ok(m.faultTypes.length > 0, `${m.code} belongs to no fault type`);
    assert.equal(isFailureMode(m.code), true);
  }
  assert.equal(isFailureMode("MADE_UP"), false);
  assert.equal(failureModeLabel("MADE_UP"), "—");
  assert.equal(failureModeLabel(null), "—");
});

test("detection methods distinguish caught-by-PM from found-on-breakdown", () => {
  const codes = DETECTION_METHODS.map((d) => d.code);
  assert.ok(codes.includes("PM_INSPECTION"));
  assert.ok(codes.includes("BREAKDOWN"));
  assert.equal(new Set(codes).size, codes.length);
});
