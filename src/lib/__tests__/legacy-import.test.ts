// Regression tests for the legacy-workbook classifiers. These decide what forty
// years of hand-kept records become in the system, and the module's own contract
// is that anything it cannot resolve becomes an ERROR the admin sees — never a
// guess.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CellValue } from "exceljs";
import {
  HISTORY_TICK_CATEGORY,
  addDays,
  classifyHistoryText,
  normName,
  parseLegacyDate,
} from "@/lib/import/legacy-parse";

// The workbook cell union is wider than anything we need to fabricate here.
const cell = (v: unknown) => parseLegacyDate(v as CellValue);

// ── classifyHistoryText ──────────────────────────────────────────────────────

test("preventive wording maps to PM", () => {
  assert.equal(classifyHistoryText("Preventive maintenance carried out"), "PM");
  assert.equal(classifyHistoryText("PREVENTIVE SERVICE"), "PM");
  assert.equal(classifyHistoryText("Routine preventive check of the gearbox"), "PM");
});

test("corrective, breakdown and repair wording all map to CM", () => {
  assert.equal(classifyHistoryText("Corrective maintenance on the spindle"), "CM");
  assert.equal(classifyHistoryText("Machine broken down, awaiting parts"), "CM");
  assert.equal(classifyHistoryText("Repaired the hydraulic hose"), "CM");
  assert.equal(classifyHistoryText("REPAIR OF DRIVE COUPLING"), "CM");
});

test("accident wording maps to ACCIDENT", () => {
  assert.equal(classifyHistoryText("Accident during operation — operator injured"), "ACCIDENT");
  assert.equal(classifyHistoryText("ACCIDENT REPORT FILED"), "ACCIDENT");
});

test("calibration wording maps to CALIBRATION", () => {
  assert.equal(classifyHistoryText("Calibration certificate issued"), "CALIBRATION");
  assert.equal(classifyHistoryText("Torque wrench calibrated by vendor"), "CALIBRATION");
});

test("anything unrecognised is a NOTE, not a guess", () => {
  assert.equal(classifyHistoryText("Machine transferred to Bay 3"), "NOTE");
  assert.equal(classifyHistoryText("Inspection carried out"), "NOTE");
  assert.equal(classifyHistoryText(""), "NOTE");
  assert.equal(classifyHistoryText("   "), "NOTE");
});

test("classification precedence is preventive > corrective > accident > calibration", () => {
  // Mixed descriptions are common in the legacy log; the first rule that matches
  // wins, so the ordering is part of the contract.
  assert.equal(classifyHistoryText("Preventive maintenance after the breakdown repair"), "PM");
  assert.equal(classifyHistoryText("Corrective repair following an accident"), "CM");
  assert.equal(classifyHistoryText("Repair and re-calibration of the gauge"), "CM");
  assert.equal(classifyHistoryText("Accident damage — recalibrated afterwards"), "ACCIDENT");
});

test("the classifier is case-insensitive and tolerates the log's real spellings", () => {
  assert.equal(classifyHistoryText("pReVeNtIvE maintenance"), "PM");
  // "preventative" is common in the hand-typed workbooks — it must not fall
  // through to NOTE, which would hide a PM from the machine's timeline.
  assert.equal(classifyHistoryText("Preventative maintenance carried out"), "PM");
  assert.equal(classifyHistoryText("PM done on the hydraulic unit"), "PM");
  assert.equal(classifyHistoryText("Replaced the contactor"), "CM");
  assert.equal(classifyHistoryText("Reported incident on the guard"), "ACCIDENT");
  assert.equal(classifyHistoryText("Operator handover notes"), "NOTE");
});

// ── HISTORY_TICK_CATEGORY ────────────────────────────────────────────────────

test("the A-H tick legend maps to the documented categories", () => {
  assert.deepEqual(HISTORY_TICK_CATEGORY, {
    A: "CALIBRATION",
    B: "INSPECTION",
    C: "PM",
    D: "CM",
    E: "TRANSFER",
    F: "ACCIDENT",
    G: "CM",
    H: "OTHER",
  });
});

test("the legend covers exactly A-H and nothing else", () => {
  assert.deepEqual(Object.keys(HISTORY_TICK_CATEGORY), ["A", "B", "C", "D", "E", "F", "G", "H"]);
  assert.equal(HISTORY_TICK_CATEGORY["I"], undefined);
  assert.equal(HISTORY_TICK_CATEGORY["a"], undefined);
  assert.equal(HISTORY_TICK_CATEGORY[""], undefined);
});

test("D and G are the two corrective ticks", () => {
  const cm = Object.entries(HISTORY_TICK_CATEGORY).filter(([, v]) => v === "CM").map(([k]) => k);
  assert.deepEqual(cm, ["D", "G"]);
});

// ── parseLegacyDate ──────────────────────────────────────────────────────────

test("an empty or N/A cell is empty, not an error", () => {
  for (const v of [null, undefined, "", "   ", "N/A", "n/a", "NA", "Nill", "Nil", "none", "-", "---"]) {
    assert.deepEqual(cell(v), { iso: null, error: null }, `"${String(v)}" should be an empty date`);
  }
});

test("ISO strings parse straight through", () => {
  assert.deepEqual(cell("2026-01-15"), { iso: "2026-01-15", error: null });
  assert.deepEqual(cell("2026-01-15T09:30:00Z"), { iso: "2026-01-15", error: null });
});

test("hand-typed d/m/y strings parse with any common separator", () => {
  for (const s of ["15/01/2026", "15.01.2026", "15-01-2026", "15/1/2026", "5/1/2026"]) {
    const expected = s.startsWith("5") ? "2026-01-05" : "2026-01-15";
    assert.deepEqual(cell(s), { iso: expected, error: null }, s);
  }
});

test("a two-digit year is read as 20xx", () => {
  assert.deepEqual(cell("15/01/26"), { iso: "2026-01-15", error: null });
  assert.deepEqual(cell("01/03/09"), { iso: "2009-03-01", error: null });
});

test("an m/d slip is corrected only when it is unambiguous", () => {
  // 13 cannot be a month, and 5 can be a day: read as 13 May.
  assert.deepEqual(cell("5/13/2026"), { iso: "2026-05-13", error: null });
  // Both parts plausible as a day: taken as d/m, no guessing.
  assert.deepEqual(cell("5/12/2026"), { iso: "2026-12-05", error: null });
});

test("an impossible d/m/y is an error, never a guess", () => {
  assert.equal(cell("32/01/2026").iso, null);
  assert.match(cell("32/01/2026").error ?? "", /not a valid d\/m\/y date/);
  assert.equal(cell("13/13/2026").iso, null);
  assert.match(cell("13/13/2026").error ?? "", /not a valid d\/m\/y date/);
  assert.equal(cell("00/01/2026").iso, null);
});

test("a date with no year is an error, never a guess", () => {
  for (const s of ["15/01", "15-01", "1.3"]) {
    const p = cell(s);
    assert.equal(p.iso, null, s);
    assert.match(p.error ?? "", /has no year/, s);
  }
});

test("a year outside 2000-2100 is rejected as implausible", () => {
  assert.match(cell("1995-05-05").error ?? "", /outside a plausible range/);
  assert.match(cell("15/01/1999").error ?? "", /outside a plausible range/);
  assert.equal(cell("1995-05-05").iso, null);
});

test("unreadable free text is an error", () => {
  const p = cell("UNDER REPAIR");
  assert.equal(p.iso, null);
  assert.match(p.error ?? "", /Could not read/);
});

test("Excel date serials inside the 2000s window parse, others error", () => {
  assert.deepEqual(cell(46037), { iso: "2026-01-15", error: null });
  for (const n of [0, 100, 36526, 73050, -5]) {
    const p = cell(n);
    assert.equal(p.iso, null, `serial ${n}`);
    assert.match(p.error ?? "", /is not a recognisable date/, `serial ${n}`);
  }
});

test("formula and rich cells are unwrapped before parsing", () => {
  assert.deepEqual(cell({ formula: "A1", result: new Date(Date.UTC(2026, 0, 15)) }), { iso: "2026-01-15", error: null });
  assert.deepEqual(cell({ formula: "A1", result: "15/01/2026" }), { iso: "2026-01-15", error: null });
  assert.deepEqual(cell({ text: "15/01/2026" }), { iso: "2026-01-15", error: null });
  // A formula that evaluated to an Excel error carries no date and is not a
  // row-level failure.
  assert.deepEqual(cell({ error: "#N/A" }), { iso: null, error: null });
  assert.deepEqual(cell({}), { iso: null, error: null });
});

test("a UTC-midnight Date object keeps its calendar day", () => {
  assert.deepEqual(cell(new Date(Date.UTC(2026, 0, 15))), { iso: "2026-01-15", error: null });
});

test("dates keep their calendar day in any timezone", () => {
  // LIMSL runs at UTC+1. Reading UTC components off a LOCAL-midnight date
  // silently shifts every such record back a day, so the calendar day the cell
  // reads as is the day that must be stored — in every timezone this suite runs.
  const fromWords = cell("March 5, 2026");
  assert.equal(fromWords.error, null);
  assert.equal(fromWords.iso, "2026-03-05");

  assert.equal(cell(new Date(2026, 0, 15)).iso, "2026-01-15"); // local midnight
  assert.equal(cell(new Date(Date.UTC(2026, 0, 15))).iso, "2026-01-15"); // ExcelJS UTC midnight
});

// ── addDays / normName ───────────────────────────────────────────────────────

test("addDays walks the calendar in UTC, across months, years and leap days", () => {
  assert.equal(addDays("2026-01-15", 0), "2026-01-15");
  assert.equal(addDays("2026-01-15", 1), "2026-01-16");
  assert.equal(addDays("2026-01-15", -1), "2026-01-14");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29"); // leap year
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", 365), "2027-01-01");
  // Day-numbered calendar columns are anchored with (day - 1).
  assert.equal(addDays("2026-01-01", 366 - 1), "2027-01-01");
});

test("normName strips punctuation and case so truncated sheet tabs still match", () => {
  const full = normName("Serton Rolling Machine (10mm - 35mm)");
  const tab = normName("Serton Rolling Machine (10m");
  assert.equal(full, "sertonrollingmachine10mm35mm");
  assert.ok(full.startsWith(tab), `"${full}" should start with "${tab}"`);
  assert.equal(normName("LEE/PE/0012"), "leepe0012");
  assert.equal(normName("  Press   Brake  "), "pressbrake");
  assert.equal(normName(""), "");
});
