// src/lib/__tests__/facility-assets.test.ts
// Proof-reads the transcription.
//
// Twenty-three assets were typed in by hand from two photographed
// spreadsheets, and this machine cannot reach a database to look at the result.
// A wrong digit in a serial or a slipped date would go in, look entirely
// normal, and surface the day somebody tried to match a record to a nameplate.
//
// The strongest check available is internal consistency: the source sheets
// carry redundancy (a per-floor unit count, and a service interval that is the
// same 120 days on all nineteen rows), so a mistyped date or a dropped row
// breaks an arithmetic relationship rather than merely looking odd.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AC_UNITS,
  AC_SERVICE_INTERVAL_DAYS,
  CALIBRATED_INSTRUMENTS,
  CONFLICTS,
} from "../facility-assets";
import { parseAssetId } from "../asset-id";

const daysBetween = (from: string, to: string): number => {
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return (d(to) - d(from)) / 864e5;
};

test("the floor counts match the totals printed on the servicing sheet", () => {
  // The sheet states 9 on the ground floor and 10 on the top floor. Those
  // totals are the only thing that catches a row dropped during transcription.
  assert.equal(AC_UNITS.length, 19);
  assert.equal(AC_UNITS.filter((u) => u.bay === "Ground Floor").length, 9);
  assert.equal(AC_UNITS.filter((u) => u.bay === "Top Floor").length, 10);
});

test("every AC tag is a well-formed OE asset ID and appears once", () => {
  const seen = new Set<string>();
  for (const u of AC_UNITS) {
    const parsed = parseAssetId(u.assetId);
    assert.ok(parsed, `${u.assetId} (${u.name}) is not a valid asset ID`);
    assert.equal(parsed!.prefix, "OE", `${u.assetId} should be in the OE series`);
    assert.ok(!seen.has(u.assetId), `${u.assetId} is used twice`);
    seen.add(u.assetId);
  }
});

test("every unit is serviced on the same 120-day cycle", () => {
  // All nineteen rows on the sheet share one interval. A date typed with the
  // wrong month or day lands here rather than in the register.
  for (const u of AC_UNITS) {
    assert.equal(
      daysBetween(u.lastMaintenanceDate, u.nextMaintenanceDate),
      AC_SERVICE_INTERVAL_DAYS,
      `${u.assetId} (${u.name}): ${u.lastMaintenanceDate} to ${u.nextMaintenanceDate} is not ${AC_SERVICE_INTERVAL_DAYS} days`,
    );
  }
});

test("no unit is missing the details that identify it", () => {
  for (const u of AC_UNITS) {
    for (const key of ["name", "oem", "model", "serialNumber", "location", "subCategory"] as const) {
      assert.ok(u[key], `${u.assetId} has no ${key}`);
    }
    assert.match(u.subCategory, /^(1\.5|2)HP split unit$/, `${u.assetId} has an odd power rating`);
  }
});

test("a repeated serial number is never silently accepted", () => {
  // Two assets sharing a serial is either a transcription error or two units
  // genuinely mislabelled, and both need a person. What must not happen is the
  // register carrying the duplicate with nothing recorded against it.
  const byUnit = new Map<string, string[]>();
  for (const u of AC_UNITS) {
    byUnit.set(u.serialNumber, [...(byUnit.get(u.serialNumber) ?? []), u.assetId]);
  }
  for (const [serial, tags] of byUnit) {
    if (tags.length === 1) continue;
    for (const tag of tags) {
      const unit = AC_UNITS.find((u) => u.assetId === tag)!;
      assert.ok(
        unit.notes && unit.notes.includes(serial),
        `${tag} shares serial ${serial} with ${tags.filter((t) => t !== tag).join(", ")} and says nothing about it`,
      );
    }
  }
});

test("each instrument's stated interval matches its own dates", () => {
  assert.equal(CALIBRATED_INSTRUMENTS.length, 4);
  for (const i of CALIBRATED_INSTRUMENTS) {
    assert.equal(
      daysBetween(i.lastCalibrationDate, i.nextCalibrationDate),
      i.calibrationInterval,
      `${i.name}: ${i.lastCalibrationDate} to ${i.nextCalibrationDate} is not ${i.calibrationInterval} days`,
    );
  }
});

test("the expired instrument is recorded as expired", () => {
  // The earth resistance tester's calibration ran out on 2025-03-01. It is the
  // one finding in this batch that has compliance weight, so it gets its own
  // assertion rather than relying on somebody reading the note.
  const tester = CALIBRATED_INSTRUMENTS.find((i) => i.model === "HT20302");
  assert.ok(tester, "the Habotest earth resistance tester is missing");
  assert.equal(tester!.nextCalibrationDate, "2025-03-01");
  assert.ok(tester!.notes?.includes("expired"), "its expiry is not written down anywhere");
});

test("every conflict in the checklist is also flagged on the asset itself", () => {
  // CONFLICTS exists to be printed and walked round the building. If it drifts
  // from the notes on the records, the walk checks the wrong things.
  const flagged = [
    ...AC_UNITS.filter((u) => u.notes).map((u) => u.assetId),
    ...CALIBRATED_INSTRUMENTS.filter((i) => i.notes).map((i) => i.model),
  ];
  assert.ok(CONFLICTS.length > 0);
  for (const ref of ["LEE/OE/2178", "LEE/OE/2179", "LEE/OE/1840", "LEE/OE/2233", "LEE/OE/2234", "LEE/OE/1809"]) {
    assert.ok(
      CONFLICTS.some((c) => c.includes(ref)),
      `${ref} carries a note but is not on the conflict checklist`,
    );
    assert.ok(flagged.includes(ref), `${ref} is on the conflict checklist but carries no note`);
  }
});
