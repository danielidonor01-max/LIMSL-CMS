// src/lib/earthing/earthing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changeVsPrevious,
  dueStatus,
  evaluateFallOfPotential,
  instrumentLabel,
  isEarthInstrument,
  isEarthingSystemRow,
  latestPerPit,
  parseReadings,
  probePositions,
  slopePerYear,
  validatePit,
  calibrationWarning,
  EARTHING_INTERVAL_DAYS,
} from "@/lib/earthing/earthing";

test("the potential probe positions are 52, 62 and 72 percent of D", () => {
  assert.deepEqual(probePositions(30), [
    { positionPct: 52, distanceM: 15.6 },
    { positionPct: 62, distanceM: 18.6 },
    { positionPct: 72, distanceM: 21.6 },
  ]);
  assert.deepEqual(
    probePositions(null).map((p) => p.distanceM),
    [null, null, null],
  );
});

test("the result is the 62% reading and agreeing readings make the test consistent", () => {
  const r = evaluateFallOfPotential({ currentProbeDistanceM: 30, r52: 2.0, r62: 2.05, r72: 2.1, limitOhms: 5 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.resistanceOhms, 2.05);
  assert.equal(r.value.consistent, true);
  assert.equal(r.value.spreadPct, 2.4);
  assert.equal(r.value.verdict, "PASS");
  assert.equal(r.value.advice, null);
  assert.equal(r.value.readings.length, 3);
  assert.equal(r.value.readings[1].distanceM, 18.6);
});

test("readings outside ±5% are kept but flagged, with the advice to move the spike out", () => {
  const r = evaluateFallOfPotential({ currentProbeDistanceM: 10, r52: 1.6, r62: 2.0, r72: 2.5, limitOhms: 5 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.consistent, false);
  assert.equal(r.value.spreadPct, 25);
  assert.match(r.value.advice ?? "", /move the current spike further out/);
  assert.equal(r.value.verdict, "PASS");
});

test("exactly 5% is still consistent", () => {
  const r = evaluateFallOfPotential({ r52: 1.9, r62: 2.0, r72: 2.1, limitOhms: 5 });
  assert.ok(r.ok && r.value.consistent === true);
});

test("a reading above the pit limit fails, and the limit is the pit's own", () => {
  const r = evaluateFallOfPotential({ r62: 1.2, singleReading: true, limitOhms: 1 });
  assert.ok(r.ok && r.value.verdict === "FAIL");
  const eq = evaluateFallOfPotential({ r62: 5, singleReading: true, limitOhms: 5 });
  assert.ok(eq.ok && eq.value.verdict === "PASS", "a reading equal to the limit is within it");
});

test("a single-reading test is allowed, and its consistency is unknown rather than assumed", () => {
  const r = evaluateFallOfPotential({ r62: 3.1, singleReading: true, limitOhms: 5 });
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.value.consistent, null);
  assert.equal(r.value.spreadPct, null);
  assert.equal(r.value.readings.length, 1);
});

test("missing or impossible readings are refused with a reason", () => {
  assert.equal(evaluateFallOfPotential({ r62: "", limitOhms: 5 }).ok, false);
  assert.equal(evaluateFallOfPotential({ r62: 0, singleReading: true, limitOhms: 5 }).ok, false);
  assert.equal(evaluateFallOfPotential({ r62: -1, singleReading: true, limitOhms: 5 }).ok, false);
  assert.equal(evaluateFallOfPotential({ r62: 2, r52: 2, limitOhms: 5 }).ok, false, "72% reading missing");
  assert.equal(evaluateFallOfPotential({ r62: 2, singleReading: true, limitOhms: 0 }).ok, false);
  assert.equal(
    evaluateFallOfPotential({ r62: 2, singleReading: true, limitOhms: 5, currentProbeDistanceM: -3 }).ok,
    false,
  );
});

test("stored readings parse back, and junk does not crash the page", () => {
  assert.deepEqual(parseReadings('[{"positionPct":62,"distanceM":18.6,"ohms":2.1}]'), [
    { positionPct: 62, distanceM: 18.6, ohms: 2.1 },
  ]);
  assert.deepEqual(parseReadings("not json"), []);
  assert.deepEqual(parseReadings(null), []);
});

const t = (pitId: string, testDate: string, resistanceOhms: number, createdAt = "") => ({
  pitId,
  testDate,
  resistanceOhms,
  createdAt,
});

test("latest per pit is the newest test date, then the newest entry", () => {
  const latest = latestPerPit([
    t("a", "2025-04-01", 3),
    t("a", "2026-04-01", 4, "2026-04-01T09:00:00Z"),
    t("a", "2026-04-01", 4.5, "2026-04-01T10:00:00Z"),
    t("b", "2024-01-01", 1),
  ]);
  assert.equal(latest.get("a")?.resistanceOhms, 4.5);
  assert.equal(latest.get("b")?.resistanceOhms, 1);
});

test("change against the previous reading is a percentage of the previous one", () => {
  assert.equal(changeVsPrevious([t("a", "2025-01-01", 2), t("a", "2026-01-01", 2.5)]), 25);
  assert.equal(changeVsPrevious([t("a", "2026-01-01", 2)]), null);
});

test("the slope is in ohms per year", () => {
  const s = slopePerYear([t("a", "2024-01-01", 2), t("a", "2025-01-01", 3), t("a", "2026-01-01", 4)]);
  assert.ok(s !== null && Math.abs(s - 1) < 0.01, `slope ${s}`);
  assert.equal(slopePerYear([t("a", "2026-01-01", 2)]), null);
  assert.equal(slopePerYear([t("a", "2026-01-01", 2), t("a", "2026-01-01", 3)]), null);
});

test("a pit is due a year after its last test, due soon inside 30 days, overdue after", () => {
  assert.equal(EARTHING_INTERVAL_DAYS, 365);
  assert.deepEqual(dueStatus(null, "2026-11-17"), { state: "NEVER", nextDue: null, days: null });
  assert.equal(dueStatus("2026-01-10", "2026-11-17").state, "CURRENT");
  assert.equal(dueStatus("2025-12-01", "2026-11-17").state, "DUE_SOON");
  const late = dueStatus("2025-04-22", "2026-11-17");
  assert.equal(late.state, "OVERDUE");
  assert.equal(late.nextDue, "2026-04-22");
});

test("the Habotest is recognised as an earth tester and labelled by make, model and serial", () => {
  const habotest = {
    instrumentName: "Earth Resistance Tester, Habotest HT20302",
    make: "HABOTEST",
    model: "HT20302",
    serialNumber: "H12D-J051012",
  };
  assert.equal(isEarthInstrument(habotest), true);
  assert.equal(isEarthInstrument({ instrumentName: "True RMS Multimeter, Fluke 179", make: "Fluke", model: "179" }), false);
  assert.equal(instrumentLabel(habotest), "HABOTEST HT20302 · S/N H12D-J051012");
});

test("an out-of-calibration instrument warns, a current one does not", () => {
  assert.ok(calibrationWarning("OVERDUE"));
  assert.ok(calibrationWarning("NOT_CALIBRATED"));
  assert.ok(calibrationWarning("OUT_OF_SERVICE"));
  assert.equal(calibrationWarning("CURRENT"), null);
  assert.equal(calibrationWarning("DUE_SOON"), null);
});

test("pits need a code, a name and a positive limit", () => {
  assert.equal(validatePit({ code: "EP-01", name: "Main DB earth", limitOhms: 5 }), null);
  assert.ok(validatePit({ code: "", name: "x", limitOhms: 5 }));
  assert.ok(validatePit({ code: "EP-01", name: "", limitOhms: 5 }));
  assert.ok(validatePit({ code: "EP-01", name: "x", limitOhms: 0 }));
  assert.ok(validatePit({ code: "EP-01", name: "x", limitOhms: 5, electrodeType: "SPOON" }));
  assert.equal(validatePit({ limitOhms: 1 }, { partial: true }), null);
});

test("the legacy import's earthing system row is recognised so a re-import skips it", () => {
  assert.equal(isEarthingSystemRow({ leeTag: "", name: "Earthing system" }), true);
  assert.equal(isEarthingSystemRow({ leeTag: null, name: "EARTHING" }), true);
  assert.equal(isEarthingSystemRow({ leeTag: "LEE/PE/0012", name: "Earthing tester" }), false);
  assert.equal(isEarthingSystemRow({ leeTag: "", name: "Fire alarm system" }), false);
});
