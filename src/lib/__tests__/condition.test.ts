import { test } from "node:test";
import assert from "node:assert/strict";
import {
  verdictFor,
  trendOf,
  programmeHealth,
  CONDITION_LABELS,
  CONDITION_UNITS,
  VERDICT_LABELS,
  VERDICT_BADGE,
} from "@/lib/maintenance/condition";

// Two thresholds, because one collapses "watch it and plan" and "stop and
// intervene" into the same response, which in practice means the alert is
// ignored until it is an alarm.
test("alert and alarm are distinct verdicts", () => {
  assert.equal(verdictFor(50, 70, 90), "NORMAL");
  assert.equal(verdictFor(70, 70, 90), "ALERT");
  assert.equal(verdictFor(85, 70, 90), "ALERT");
  assert.equal(verdictFor(90, 70, 90), "ALARM");
  assert.equal(verdictFor(120, 70, 90), "ALARM");
});

test("a reading with no limits set is not reported as normal", () => {
  assert.equal(verdictFor(85, null, null), "NO_LIMIT");
  assert.equal(verdictFor(85, undefined, undefined), "NO_LIMIT");
});

test("one limit on its own still works", () => {
  assert.equal(verdictFor(95, null, 90), "ALARM");
  assert.equal(verdictFor(50, null, 90), "NORMAL");
  assert.equal(verdictFor(75, 70, null), "ALERT");
});

test("a malformed reading yields no verdict rather than a false normal", () => {
  assert.equal(verdictFor(NaN, 70, 90), "NO_LIMIT");
});

test("every kind and verdict has a label, unit and badge", () => {
  for (const k of Object.keys(CONDITION_LABELS) as (keyof typeof CONDITION_LABELS)[]) {
    assert.ok(CONDITION_LABELS[k].length > 0);
    assert.ok(CONDITION_UNITS[k].length > 0);
  }
  for (const v of Object.keys(VERDICT_LABELS) as (keyof typeof VERDICT_LABELS)[]) {
    assert.ok(VERDICT_LABELS[v].length > 0);
    assert.ok(VERDICT_BADGE[v].length > 0);
  }
});

// The whole point: a bearing running hotter each month is invisible in any
// single reading, and every single reading here is "within limits".
test("a slow rise is detected even while every reading is normal", () => {
  const r = trendOf(
    [
      { value: 52, takenOn: "2026-05-01" },
      { value: 56, takenOn: "2026-06-01" },
      { value: 60, takenOn: "2026-07-01" },
      { value: 64, takenOn: "2026-08-01" },
    ],
    90,
  );
  assert.equal(r.direction, "RISING");
  assert.ok(r.changePerMonth !== null && r.changePerMonth > 3.5);
  for (const v of [52, 56, 60, 64]) assert.equal(verdictFor(v, 70, 90), "NORMAL");
});

test("the projection says when it will cross the alarm if nothing changes", () => {
  const from = new Date("2026-08-08T00:00:00Z");
  const r = trendOf(
    [
      { value: 60, takenOn: "2026-06-08" },
      { value: 70, takenOn: "2026-07-08" },
      { value: 80, takenOn: "2026-08-08" },
    ],
    100,
    from,
  );
  assert.equal(r.direction, "RISING");
  assert.ok(r.projectedAlarmDate, "a rising trend towards a known alarm must project a date");
  assert.ok(r.projectedAlarmDate! > "2026-08-08");
});

// Calling two points a trend produces confident nonsense.
test("fewer than three readings is UNKNOWN, not a trend", () => {
  assert.equal(trendOf([]).direction, "UNKNOWN");
  assert.equal(trendOf([{ value: 5, takenOn: "2026-01-01" }]).direction, "UNKNOWN");
  assert.equal(
    trendOf([
      { value: 5, takenOn: "2026-01-01" },
      { value: 90, takenOn: "2026-02-01" },
    ]).direction,
    "UNKNOWN",
  );
});

test("small wobble reads as stable rather than a trend", () => {
  const r = trendOf([
    { value: 60, takenOn: "2026-06-01" },
    { value: 60.2, takenOn: "2026-07-01" },
    { value: 59.9, takenOn: "2026-08-01" },
  ]);
  assert.equal(r.direction, "STABLE");
  assert.equal(r.projectedAlarmDate, null, "a stable reading must never project a failure");
});

test("a falling trend is recognised and projects nothing", () => {
  const r = trendOf(
    [
      { value: 80, takenOn: "2026-06-01" },
      { value: 70, takenOn: "2026-07-01" },
      { value: 60, takenOn: "2026-08-01" },
    ],
    100,
  );
  assert.equal(r.direction, "FALLING");
  assert.equal(r.projectedAlarmDate, null);
});

test("already past the alarm projects nothing, it is not a forecast any more", () => {
  const r = trendOf(
    [
      { value: 95, takenOn: "2026-06-01" },
      { value: 100, takenOn: "2026-07-01" },
      { value: 110, takenOn: "2026-08-01" },
    ],
    90,
  );
  assert.equal(r.projectedAlarmDate, null);
});

test("irregular reading intervals are handled, since real ones never are even", () => {
  const r = trendOf([
    { value: 50, takenOn: "2026-05-02" },
    { value: 58, takenOn: "2026-06-19" },
    { value: 61, takenOn: "2026-06-28" },
    { value: 70, takenOn: "2026-08-05" },
  ]);
  assert.equal(r.direction, "RISING");
});

test("readings all on one day cannot form a trend", () => {
  const r = trendOf([
    { value: 50, takenOn: "2026-05-01" },
    { value: 60, takenOn: "2026-05-01" },
    { value: 70, takenOn: "2026-05-01" },
  ]);
  assert.equal(r.direction, "UNKNOWN");
});

// A register full of one-off readings from eighteen months ago is worse than
// nothing, because it looks like a programme.
test("a mostly-overdue register is not reported as a kept-up programme", () => {
  const h = programmeHealth(
    [
      { lastReadingDate: "2026-08-01", intervalDays: 30 },
      { lastReadingDate: "2025-01-01", intervalDays: 30 },
      { lastReadingDate: null, intervalDays: 30 },
    ],
    "2026-08-08",
  );
  assert.equal(h.total, 3);
  assert.equal(h.current, 1);
  assert.equal(h.overdue, 1);
  assert.equal(h.neverRead, 1);
  assert.equal(h.keptUp, false);
});

test("a fully current register is kept up", () => {
  const h = programmeHealth(
    [
      { lastReadingDate: "2026-08-01", intervalDays: 30 },
      { lastReadingDate: "2026-07-20", intervalDays: 30 },
    ],
    "2026-08-08",
  );
  assert.equal(h.keptUp, true);
  assert.equal(h.overdue, 0);
});

test("an empty register is not kept up, there is nothing being monitored", () => {
  assert.equal(programmeHealth([], "2026-08-08").keptUp, false);
});

test("a malformed last-reading date counts as never read, not as current", () => {
  const h = programmeHealth([{ lastReadingDate: "whenever", intervalDays: 30 }], "2026-08-08");
  assert.equal(h.neverRead, 1);
  assert.equal(h.current, 0);
});
