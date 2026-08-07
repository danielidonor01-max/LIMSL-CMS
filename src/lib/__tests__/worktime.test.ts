// Regression tests for production-time arithmetic — the input to every downtime,
// MTTR/MTBF and availability figure. A machine is only "down" while the workshop
// would otherwise have been running.
//
// All dates here are January 2026 (Thu 1st … Sat 31st) and are written as local
// `datetime-local` values, matching what the forms submit.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WORK_SETTINGS,
  isProductionDay,
  plannedHoursForMonth,
  productionDaysInMonth,
  productionDowntimeHours,
  productiveHoursPerDay,
  type WorkSettings,
} from "@/lib/worktime";

const S = DEFAULT_WORK_SETTINGS; // 08:00–17:00, lunch 12:00–13:00, Mon–Fri
const settings = (over: Partial<WorkSettings> = {}): WorkSettings => ({ ...DEFAULT_WORK_SETTINGS, ...over });

const MON = "2026-01-05"; // Monday
const TUE = "2026-01-06";
const WED = "2026-01-07";
const FRI = "2026-01-09";
const SAT = "2026-01-10";
const NEXT_MON = "2026-01-12";

// ── The core case ────────────────────────────────────────────────────────────

test("a weekend outage counts only the production hours either side", () => {
  // Fails 16:00 Friday, fixed 09:00 Monday: one hour Friday + one hour Monday.
  assert.equal(productionDowntimeHours(`${FRI}T16:00`, `${NEXT_MON}T09:00`, S), 2);
});

test("the same outage under weekend overtime counts Saturday and Sunday", () => {
  const s = settings({ weekendOvertime: true });
  assert.equal(productionDowntimeHours(`${FRI}T16:00`, `${NEXT_MON}T09:00`, s), 18); // 1 + 8 + 8 + 1
});

// ── Same-day windows ─────────────────────────────────────────────────────────

test("a same-day window inside the shift is counted exactly", () => {
  assert.equal(productionDowntimeHours(`${MON}T09:00`, `${MON}T11:00`, S), 2);
  assert.equal(productionDowntimeHours(`${MON}T09:15`, `${MON}T09:45`, S), 0.5);
});

test("a full shift is the working window minus lunch", () => {
  assert.equal(productionDowntimeHours(`${MON}T08:00`, `${MON}T17:00`, S), 8);
});

test("hours outside the shift are excluded", () => {
  assert.equal(productionDowntimeHours(`${MON}T18:00`, `${MON}T20:00`, S), 0);
  assert.equal(productionDowntimeHours(`${MON}T00:00`, `${MON}T06:00`, S), 0);
  // 06:00–09:00 contributes only 08:00–09:00.
  assert.equal(productionDowntimeHours(`${MON}T06:00`, `${MON}T09:00`, S), 1);
  // 16:00–23:00 contributes only 16:00–17:00.
  assert.equal(productionDowntimeHours(`${MON}T16:00`, `${MON}T23:00`, S), 1);
});

test("an outage that starts and ends outside the shift still counts the whole shift", () => {
  assert.equal(productionDowntimeHours(`${MON}T05:00`, `${MON}T22:00`, S), 8);
});

// ── Lunch ────────────────────────────────────────────────────────────────────

test("lunch is excluded when configured", () => {
  assert.equal(productionDowntimeHours(`${MON}T11:00`, `${MON}T14:00`, S), 2); // 3h span, 1h lunch
  assert.equal(productionDowntimeHours(`${MON}T12:00`, `${MON}T13:00`, S), 0); // entirely lunch
  assert.equal(productionDowntimeHours(`${MON}T12:30`, `${MON}T14:00`, S), 1); // 1.5h span, 0.5h lunch
});

test("with no break configured the whole window counts", () => {
  const s = settings({ lunchStart: null, lunchEnd: null });
  assert.equal(productionDowntimeHours(`${MON}T11:00`, `${MON}T14:00`, s), 3);
  assert.equal(productionDowntimeHours(`${MON}T08:00`, `${MON}T17:00`, s), 9);
});

// ── Multi-day ────────────────────────────────────────────────────────────────

test("consecutive working days accumulate a full shift each", () => {
  assert.equal(productionDowntimeHours(`${MON}T08:00`, `${WED}T17:00`, S), 24);
});

test("a partial first and last day are both prorated", () => {
  // Mon 11:00–17:00 (5h after lunch) + Tue 08:00–10:00 (2h).
  assert.equal(productionDowntimeHours(`${MON}T11:00`, `${TUE}T10:00`, S), 7);
});

test("an outage entirely inside a weekend is zero", () => {
  assert.equal(productionDowntimeHours(`${SAT}T08:00`, `2026-01-11T17:00`, S), 0);
});

// ── Degenerate input ─────────────────────────────────────────────────────────

test("a reversed or zero-length window yields 0", () => {
  assert.equal(productionDowntimeHours(`${MON}T14:00`, `${MON}T09:00`, S), 0);
  assert.equal(productionDowntimeHours(`${MON}T09:00`, `${MON}T09:00`, S), 0);
  assert.equal(productionDowntimeHours(`${WED}T08:00`, `${MON}T08:00`, S), 0);
});

test("missing or unparseable timestamps yield 0 rather than NaN", () => {
  assert.equal(productionDowntimeHours(null, `${MON}T09:00`, S), 0);
  assert.equal(productionDowntimeHours(`${MON}T09:00`, undefined, S), 0);
  assert.equal(productionDowntimeHours("", "", S), 0);
  assert.equal(productionDowntimeHours("not a date", `${MON}T09:00`, S), 0);
  assert.equal(productionDowntimeHours(`${MON}T09:00`, "not a date", S), 0);
});

test("no working days configured means no production time can accrue", () => {
  const s = settings({ workingDays: [], weekendOvertime: false });
  assert.equal(productionDowntimeHours(`${MON}T08:00`, `${WED}T17:00`, s), 0);
});

test("the result is rounded to two decimals", () => {
  const v = productionDowntimeHours(`${MON}T09:00`, `${MON}T09:20`, S);
  assert.equal(v, 0.33);
});

// ── isProductionDay ──────────────────────────────────────────────────────────

test("isProductionDay follows the configured week", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map((d) => isProductionDay(d, S)), [false, true, true, true, true, true, false]);

  const withWeekends = settings({ weekendOvertime: true });
  assert.deepEqual([0, 6].map((d) => isProductionDay(d, withWeekends)), [true, true]);

  // Weekend overtime only adds Sat/Sun — it does not resurrect a disabled weekday.
  const weekendOnly = settings({ workingDays: [], weekendOvertime: true });
  assert.deepEqual([0, 1, 6].map((d) => isProductionDay(d, weekendOnly)), [true, false, true]);
});

// ── Daily / monthly baselines ────────────────────────────────────────────────

test("productiveHoursPerDay is the window minus the part of lunch inside it", () => {
  assert.equal(productiveHoursPerDay(S), 8);
  assert.equal(productiveHoursPerDay(settings({ lunchStart: null, lunchEnd: null })), 9);
  // A break scheduled outside the working window cannot subtract anything.
  assert.equal(productiveHoursPerDay(settings({ lunchStart: "18:00", lunchEnd: "19:00" })), 9);
  // Only the overlapping half hour of lunch is deducted from a short shift.
  assert.equal(productiveHoursPerDay(settings({ workDayEnd: "12:30" })), 4);
  // A reversed break is ignored.
  assert.equal(productiveHoursPerDay(settings({ lunchStart: "13:00", lunchEnd: "12:00" })), 9);
});

test("a reversed or zero-length working window gives no productive hours", () => {
  assert.equal(productiveHoursPerDay(settings({ workDayStart: "17:00", workDayEnd: "08:00" })), 0);
  assert.equal(productiveHoursPerDay(settings({ workDayStart: "08:00", workDayEnd: "08:00" })), 0);
});

test("productionDaysInMonth counts the configured working days", () => {
  assert.equal(productionDaysInMonth("2026-01", S), 22);
  assert.equal(productionDaysInMonth("2026-02", S), 20);
  assert.equal(productionDaysInMonth("2026-02", settings({ weekendOvertime: true })), 28);
  assert.equal(productionDaysInMonth("2024-02", S), 21); // leap February
  assert.equal(productionDaysInMonth("", S), 0);
  assert.equal(productionDaysInMonth("not-a-month", S), 0);
});

test("plannedHoursForMonth is the availability baseline for the month", () => {
  assert.equal(plannedHoursForMonth("2026-01", S), 176); // 22 days x 8h
  assert.equal(plannedHoursForMonth("2026-02", S), 160); // 20 days x 8h
  assert.equal(plannedHoursForMonth("2026-01", settings({ workingDays: [] })), 0);
});

test("downtime for a month can never exceed that month's planned hours", () => {
  // The property the availability KPI depends on.
  const downtime = productionDowntimeHours("2026-01-01T00:00", "2026-02-01T00:00", S);
  assert.equal(downtime, plannedHoursForMonth("2026-01", S));
});
