// src/lib/maintenance/plan-generation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedDatesFor, missingDates, FREQUENCY_MONTHS } from "./plan-generation";

test("a quarterly machine falls due four times a year", () => {
  const d = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2025-02-10", year: 2026 });
  assert.deepEqual(d.map((x) => x.plannedDate), [
    "2026-02-10",
    "2026-05-10",
    "2026-08-10",
    "2026-11-10",
  ]);
});

test("an annual machine falls due once, in its own month", () => {
  const d = plannedDatesFor({ frequency: "ANNUAL", anchorDate: "2024-09-03", year: 2026 });
  assert.deepEqual(d.map((x) => x.plannedDate), ["2026-09-03"]);
});

test("a monthly machine falls due twelve times", () => {
  const d = plannedDatesFor({ frequency: "MONTHLY", anchorDate: "2025-01-15", year: 2026 });
  assert.equal(d.length, 12);
  assert.equal(d[0].plannedDate, "2026-01-15");
  assert.equal(d[11].plannedDate, "2026-12-15");
});

test("the anchor month decides the cycle, not the calendar quarter", () => {
  // Two machines of one category bought months apart really are due at
  // different times. Sweeping both onto Jan/Apr/Jul/Oct would describe a
  // factory that does not exist.
  const feb = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2025-02-01", year: 2026 });
  const jan = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2025-01-01", year: 2026 });
  assert.equal(feb[0].plannedDate, "2026-02-01");
  assert.equal(jan[0].plannedDate, "2026-01-01");
});

test("a 31st never slides into the next month", () => {
  const d = plannedDatesFor({ frequency: "MONTHLY", anchorDate: "2025-01-31", year: 2026 });
  assert.equal(d[1].plannedDate, "2026-02-28", "February has no 31st");
  assert.equal(d[3].plannedDate, "2026-04-30", "April has no 31st");
  assert.equal(d[0].plannedDate, "2026-01-31");
});

test("a machine with no interval recorded gets no plan", () => {
  // Nobody has decided about it. Inventing a schedule would be inventing work.
  assert.deepEqual(plannedDatesFor({ frequency: null, anchorDate: "2025-01-01", year: 2026 }), []);
  assert.deepEqual(plannedDatesFor({ frequency: "", anchorDate: "2025-01-01", year: 2026 }), []);
  assert.deepEqual(plannedDatesFor({ frequency: "WHENEVER", anchorDate: "2025-01-01", year: 2026 }), []);
});

test("adding a machine today does not back-date work nobody could have done", () => {
  const d = plannedDatesFor({
    frequency: "QUARTERLY",
    anchorDate: "2025-02-10",
    year: 2026,
    notBefore: "2026-09-24",
  });
  assert.deepEqual(d.map((x) => x.plannedDate), ["2026-11-10"]);
});

test("quarters are labelled from the month", () => {
  const d = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2025-02-10", year: 2026 });
  assert.deepEqual(d.map((x) => x.quarter), [1, 2, 3, 4]);
});

test("a missing anchor falls back to January rather than refusing", () => {
  const d = plannedDatesFor({ frequency: "SEMI_ANNUAL", anchorDate: null, year: 2026 });
  assert.deepEqual(d.map((x) => x.plannedDate), ["2026-01-01", "2026-07-01"]);
});

test("only the dates a machine does not already have are offered", () => {
  // Rows somebody rescheduled, deferred or completed must survive. A generator
  // that overwrote them would erase decisions people made.
  const wanted = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2025-02-10", year: 2026 });
  const gaps = missingDates(wanted, [{ plannedDate: "2026-02-10" }, { plannedDate: "2026-08-10" }]);
  assert.deepEqual(gaps.map((g) => g.plannedDate), ["2026-05-10", "2026-11-10"]);
});

test("every interval the register offers is known to the planner", () => {
  for (const f of ["MONTHLY", "BI_MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]) {
    assert.ok(FREQUENCY_MONTHS[f], `${f} has no interval`);
    assert.ok(plannedDatesFor({ frequency: f, anchorDate: "2025-03-05", year: 2026 }).length > 0);
  }
});
