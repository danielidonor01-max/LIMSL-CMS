// src/lib/maintenance/plan-generation.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { plannedDatesFor, missingDates, FREQUENCY_MONTHS, categoryCalendar, calendarCollision } from "./plan-generation";
import { toWorkingDay, isWeekend } from "./working-days";

test("a quarterly machine falls due four times a year", () => {
  const d = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2025-02-10", year: 2026 });
  assert.deepEqual(d.map((x) => x.plannedDate), [
    "2026-02-10",
    "2026-05-11", // the 10th is a Sunday
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
  assert.equal(feb[0].plannedDate, "2026-02-02", "1 Feb 2026 is a Sunday");
  assert.equal(jan[0].plannedDate, "2026-01-01");
});

test("a 31st never slides into the next month", () => {
  // 2025, where the clamped dates are all weekdays, so this tests the clamp
  // and nothing else.
  const d = plannedDatesFor({ frequency: "MONTHLY", anchorDate: "2024-01-31", year: 2025 });
  assert.equal(d[1].plannedDate, "2025-02-28", "February has no 31st");
  assert.equal(d[3].plannedDate, "2025-04-30", "April has no 31st");
  assert.equal(d[0].plannedDate, "2025-01-31");
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
  assert.deepEqual(gaps.map((g) => g.plannedDate), ["2026-05-11", "2026-11-10"]);
});

test("every interval the register offers is known to the planner", () => {
  for (const f of ["MONTHLY", "BI_MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"]) {
    assert.ok(FREQUENCY_MONTHS[f], `${f} has no interval`);
    assert.ok(plannedDatesFor({ frequency: f, anchorDate: "2025-03-05", year: 2026 }).length > 0);
  }
});

// ─── No PM on a weekend ─────────────────────────────────────────────────────

test("no planned date ever falls on a Saturday or Sunday", () => {
  for (const f of Object.keys(FREQUENCY_MONTHS)) {
    for (let day = 1; day <= 31; day++) {
      const anchor = `2025-01-${String(day).padStart(2, "0")}`;
      for (const year of [2026, 2027, 2028]) {
        for (const p of plannedDatesFor({ frequency: f, anchorDate: anchor, year })) {
          assert.ok(!isWeekend(p.plannedDate), `${f} from ${anchor} planned ${p.plannedDate} in ${year}`);
        }
      }
    }
  }
});

test("a weekend date moves forward to Monday, and only that one date moves", () => {
  // 8 Aug 2026 is a Saturday. The next quarter is still counted from the 8th.
  const d = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2026-02-08", year: 2026 });
  assert.deepEqual(d.map((x) => x.plannedDate), ["2026-02-09", "2026-05-08", "2026-08-10", "2026-11-09"]);
});

test("month and quarter follow the day the work moved to", () => {
  // Saturday 31 Jan 2026 becomes Monday 2 Feb: a February job, in Q1.
  const [first] = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2026-01-31", year: 2026 });
  assert.equal(first.plannedDate, "2026-02-02");
  assert.equal(first.month, 2);
  assert.equal(first.quarter, 1);
});

test("a shifted date skips days another category already owns", () => {
  assert.equal(toWorkingDay("2026-04-25", new Set(["2026-04-27"])), "2026-04-28");
  assert.equal(toWorkingDay("2026-04-27", new Set(["2026-04-27"])), "2026-04-27", "a weekday is never moved");
});

test("the last weekend of the year walks back rather than into next year's plan", () => {
  // Sat 30 Dec 2028 has only Sunday the 31st after it.
  assert.equal(toWorkingDay("2028-12-30"), "2028-12-29");
  assert.equal(toWorkingDay("2028-12-30", new Set(["2028-12-29"])), "2028-12-28");
});

test("today's cut-off applies to the day the work moved to", () => {
  // Sun 1 Nov 2026 moves to Mon 2 Nov, which is still ahead of 2 Nov.
  const d = plannedDatesFor({ frequency: "QUARTERLY", anchorDate: "2026-02-01", year: 2026, notBefore: "2026-11-02" });
  assert.deepEqual(d.map((x) => x.plannedDate), ["2026-11-02"]);
});

test("the category calendar never puts two categories on one day after the shift", () => {
  // Press/Roll/Shear (26th) and Other (27th): Sunday 26 April would move onto
  // Monday 27 April, which is Other's. It has to go to Tuesday instead.
  const cal = categoryCalendar(
    [
      { code: "OTHER", maintenanceFrequency: "QUARTERLY", defaultStartDate: "2026-01-27" },
      { code: "PRESS_ROLL_SHEAR", maintenanceFrequency: "QUARTERLY", defaultStartDate: "2026-01-26" },
    ],
    2026,
  );
  assert.deepEqual(cal.dates.get("OTHER"), ["2026-01-27", "2026-04-27", "2026-07-27", "2026-10-27"]);
  assert.deepEqual(cal.dates.get("PRESS_ROLL_SHEAR"), ["2026-01-26", "2026-04-28", "2026-07-28", "2026-10-26"]);
  const all = [...cal.dates.values()].flat();
  assert.equal(new Set(all).size, all.length);
  assert.equal(cal.clashes.length, 0);
});

test("a proposal that would push another category off its day is a collision", () => {
  const existing = [{ code: "PRESS_ROLL_SHEAR", maintenanceFrequency: "QUARTERLY", defaultStartDate: "2026-01-26" }];
  // Taking the 27th is a weekday the proposal owns outright, so Press/Roll/Shear's
  // Sunday-the-26th would have to move again: refused.
  const hit = calendarCollision(existing, { code: "NEW", maintenanceFrequency: "QUARTERLY", defaultStartDate: "2026-01-27" }, 2026);
  assert.equal(hit?.code, "PRESS_ROLL_SHEAR");
  // The 15th disturbs nobody.
  assert.equal(
    calendarCollision(existing, { code: "NEW", maintenanceFrequency: "QUARTERLY", defaultStartDate: "2026-01-15" }, 2026),
    null,
  );
});
