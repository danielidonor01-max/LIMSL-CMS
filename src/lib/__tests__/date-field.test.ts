// src/lib/__tests__/date-field.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isIsoDate,
  parseDateInput,
  addDays,
  addMonths,
  isWithinRange,
  monthGrid,
  monthLabel,
  parseTimeInput,
  isTime,
} from "../date-field";

test("ISO dates are validated against the real calendar", () => {
  assert.equal(isIsoDate("2026-09-15"), true);
  assert.equal(isIsoDate("2026-02-29"), false); // 2026 is not a leap year
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-04-31"), false);
  assert.equal(isIsoDate("2026-00-10"), false);
  assert.equal(isIsoDate(""), false);
  assert.equal(isIsoDate(null), false);
});

test("a typed date is accepted in the forms a person actually uses", () => {
  assert.equal(parseDateInput("2026-09-15"), "2026-09-15");
  assert.equal(parseDateInput("15/09/2026"), "2026-09-15");
  assert.equal(parseDateInput("15-09-2026"), "2026-09-15");
  assert.equal(parseDateInput("15.9.2026"), "2026-09-15");
  assert.equal(parseDateInput("5/9/2026"), "2026-09-05");
});

test("dates are read day-first, since the ambiguity has to break one way", () => {
  // 09/10 is 9 October here, not 10 September.
  assert.equal(parseDateInput("09/10/2026"), "2026-10-09");
});

test("a four-digit leading part is read as a year, not a day", () => {
  assert.equal(parseDateInput("2026.09.15"), "2026-09-15");
  assert.equal(parseDateInput("2026/09/15"), "2026-09-15");
});

test("a two-digit year is this century, because a permit dated 1926 is a typo", () => {
  assert.equal(parseDateInput("15/09/26"), "2026-09-15");
});

test("nonsense returns null rather than a plausible wrong date", () => {
  for (const bad of ["", "  ", "tomorrow", "15/09", "1/2/3/4", "aa/bb/cccc", "32/01/2026", "15/13/2026"]) {
    assert.equal(parseDateInput(bad), null, bad);
  }
});

test("day arithmetic crosses months and years", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
});

test("month arithmetic clamps rather than overflowing", () => {
  // 31 January plus a month is the end of February, not the 3rd of March.
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-03-15", -1), "2026-02-15");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
});

test("range checks are inclusive at both ends", () => {
  assert.equal(isWithinRange("2026-09-15", "2026-09-15", "2026-09-20"), true);
  assert.equal(isWithinRange("2026-09-20", "2026-09-15", "2026-09-20"), true);
  assert.equal(isWithinRange("2026-09-14", "2026-09-15", null), false);
  assert.equal(isWithinRange("2026-09-21", null, "2026-09-20"), false);
  assert.equal(isWithinRange("2026-09-15"), true);
});

test("the grid is always six rows of seven, so the layout never shifts", () => {
  for (const [y, m] of [[2026, 2], [2026, 9], [2027, 1], [2024, 2]] as const) {
    assert.equal(monthGrid(y, m).length, 42, `${y}-${m}`);
  }
});

test("the grid starts on a Monday and brackets the month", () => {
  // 1 September 2026 is a Tuesday, so the grid opens on Monday 31 August.
  const grid = monthGrid(2026, 9);
  assert.equal(grid[0].iso, "2026-08-31");
  assert.equal(grid[0].inMonth, false);
  assert.equal(grid[1].iso, "2026-09-01");
  assert.equal(grid[1].inMonth, true);
  assert.equal(grid.filter((d) => d.inMonth).length, 30);
});

test("a month starting on a Monday still gets a full leading week", () => {
  // 1 June 2026 is a Monday.
  const grid = monthGrid(2026, 6);
  assert.equal(grid[0].iso, "2026-06-01");
  assert.equal(grid[0].inMonth, true);
});

test("the month label reads as a person would say it", () => {
  assert.equal(monthLabel("2026-09-15"), "September 2026");
  assert.equal(monthLabel("2026-01-01"), "January 2026");
});

test("a typed time is accepted in the forms a person actually uses", () => {
  assert.equal(parseTimeInput("08:00"), "08:00");
  assert.equal(parseTimeInput("8"), "08:00");
  assert.equal(parseTimeInput("8:5"), "08:05");
  assert.equal(parseTimeInput("0805"), "08:05");
  assert.equal(parseTimeInput("805"), "08:05");
  assert.equal(parseTimeInput("8.30"), "08:30");
});

test("am and pm are understood, including the midnight and noon traps", () => {
  assert.equal(parseTimeInput("8pm"), "20:00");
  assert.equal(parseTimeInput("8 pm"), "20:00");
  assert.equal(parseTimeInput("12am"), "00:00");
  assert.equal(parseTimeInput("12pm"), "12:00");
  assert.equal(parseTimeInput("11:30 p.m."), "23:30");
});

test("an impossible time is rejected rather than wrapped", () => {
  for (const bad of ["", "25:00", "8:75", "abc", "24:01", "99"]) {
    assert.equal(parseTimeInput(bad), null, bad);
  }
});

test("times are validated for storage", () => {
  assert.equal(isTime("08:00"), true);
  assert.equal(isTime("8:00"), false);
  assert.equal(isTime("24:00"), false);
});
