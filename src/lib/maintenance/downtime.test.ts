// src/lib/maintenance/downtime.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { downFor, expectedBack } from "./downtime";

const NOW = Date.parse("2026-09-10T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

test("a missing start time is not a zero-length breakdown", () => {
  // A fault reported without one is a gap in the record. Reporting it as "down
  // 0 hours" states something the record does not know.
  assert.equal(downFor(null, NOW), null);
  assert.equal(downFor(undefined, NOW), null);
  assert.equal(downFor("", NOW), null);
  assert.equal(downFor("not a date", NOW), null);
});

test("duration reads the way a person would say it", () => {
  assert.equal(downFor(ago(30 * 60_000), NOW)!.label, "Down under an hour");
  assert.equal(downFor(ago(HOUR), NOW)!.label, "Down 1 hour");
  assert.equal(downFor(ago(5 * HOUR), NOW)!.label, "Down 5 hours");
  assert.equal(downFor(ago(DAY), NOW)!.label, "Down 1 day");
  assert.equal(downFor(ago(2 * DAY + 4 * HOUR), NOW)!.label, "Down 2 days 4 hours");
});

test("a long breakdown reads differently from a fresh one", () => {
  // Past three days it has stopped being an incident and become a situation.
  assert.equal(downFor(ago(2 * HOUR), NOW)!.tone, "HOURS");
  assert.equal(downFor(ago(2 * DAY), NOW)!.tone, "DAYS");
  assert.equal(downFor(ago(3 * DAY), NOW)!.tone, "STALE");
});

test("a start time in the future never reports negative", () => {
  // Clock skew on a shared workshop tablet, or somebody typing next month.
  const r = downFor(ahead(2 * HOUR), NOW)!;
  assert.equal(r.hours, 0);
  assert.equal(r.label, "Down under an hour");
});

test("a local datetime without seconds parses the same as a full one", () => {
  // The column stores "YYYY-MM-DDTHH:MM", which Date.parse treats as local
  // time. Both shapes have to work or half the records read as unknown.
  assert.notEqual(downFor("2026-09-10T09:00", NOW), null);
});

test("no estimate is a visible state, not blank space", () => {
  // A breakdown with no estimate is the one production most needs to hear
  // about, so it cannot render as an empty gap.
  assert.deepEqual(expectedBack(null, NOW), { label: "No estimate given", tone: "UNKNOWN" });
  assert.deepEqual(expectedBack("", NOW), { label: "No estimate given", tone: "UNKNOWN" });
});

test("an estimate ahead of us counts down, and gets urgent near the end", () => {
  assert.equal(expectedBack(ahead(3 * HOUR), NOW).label, "Back in 3 hours");
  assert.equal(expectedBack(ahead(3 * HOUR), NOW).tone, "SOON");
  assert.equal(expectedBack(ahead(8 * HOUR), NOW).tone, "ON_TRACK");
  assert.equal(expectedBack(ahead(2 * DAY), NOW).label, "Back in 2 days");
});

test("a missed estimate says so rather than counting up quietly", () => {
  assert.equal(expectedBack(ago(30 * 60_000), NOW).label, "Estimate just passed");
  assert.equal(expectedBack(ago(5 * HOUR), NOW).label, "Past estimate by 5 hours");
  assert.equal(expectedBack(ago(2 * DAY), NOW).label, "Past estimate by 2 days");
  for (const t of [ago(30 * 60_000), ago(5 * HOUR), ago(2 * DAY)]) {
    assert.equal(expectedBack(t, NOW).tone, "OVERDUE");
  }
});
