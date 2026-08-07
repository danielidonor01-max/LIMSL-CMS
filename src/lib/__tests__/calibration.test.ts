// The ISO 9001 7.1.5.2 rules the calibration API enforces: a calibration is not
// evidence unless it says what it was traced to, an out-of-tolerance instrument
// is out of service (not merely "due"), and the non-conformity has to name the
// window of measurements whose validity is now in doubt.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AS_FOUND_VALUES,
  AS_LEFT_VALUES,
  VERDICT_VALUES,
  addDays,
  deriveInstrumentStatus,
  isSuspectCalibration,
  newestEvent,
  normalizeCalibrationEnum,
  outOfToleranceNcDescription,
  statusForNextDate,
  traceabilityError,
} from "@/lib/calibration";

const NOW = new Date("2026-08-07T00:00:00Z").getTime();

test("a calibration with neither a traced-to standard nor a lab is rejected", () => {
  assert.match(String(traceabilityError({})), /7\.1\.5\.2/);
  assert.match(String(traceabilityError({ traceableTo: "   ", labName: "" })), /traceab/i);
});

test("either the traced-to standard or the lab is enough", () => {
  assert.equal(traceabilityError({ traceableTo: "NIST via ref std SN-4471" }), null);
  assert.equal(traceabilityError({ labName: "Lagos Metrology Ltd" }), null);
  assert.equal(traceabilityError({ traceableTo: "NIST", labName: "Lagos Metrology Ltd" }), null);
});

test("calibration result enums are canonicalised, and nonsense is refused", () => {
  assert.equal(normalizeCalibrationEnum("out of tolerance", AS_FOUND_VALUES, "NOT_CHECKED"), "OUT_OF_TOLERANCE");
  assert.equal(normalizeCalibrationEnum("adjusted", AS_LEFT_VALUES, "IN_TOLERANCE"), "ADJUSTED");
  assert.equal(normalizeCalibrationEnum("fail", VERDICT_VALUES, "PASS"), "FAIL");
  assert.equal(normalizeCalibrationEnum("", VERDICT_VALUES, "PASS"), "PASS");
  assert.equal(normalizeCalibrationEnum("MAYBE", VERDICT_VALUES, "PASS"), null);
});

test("due-date status keeps the 30-day due-soon window", () => {
  assert.equal(statusForNextDate("2026-12-31", NOW), "CURRENT");
  assert.equal(statusForNextDate("2026-08-20", NOW), "DUE_SOON");
  assert.equal(statusForNextDate("2026-07-01", NOW), "OVERDUE");
  assert.equal(statusForNextDate(null, NOW), "CURRENT");
});

test("a failed or out-of-tolerance instrument is out of service, not due-soon", () => {
  assert.equal(isSuspectCalibration({ verdict: "FAIL", asFound: "IN_TOLERANCE" }), true);
  assert.equal(isSuspectCalibration({ verdict: "PASS", asFound: "OUT_OF_TOLERANCE" }), true);
  assert.equal(isSuspectCalibration({ verdict: "PASS", asFound: "IN_TOLERANCE" }), false);

  assert.equal(
    deriveInstrumentStatus({ verdict: "FAIL", asFound: "IN_TOLERANCE", nextCalibrationDate: "2027-01-01" }, NOW),
    "OUT_OF_SERVICE",
  );
  assert.equal(
    deriveInstrumentStatus({ verdict: "PASS", asFound: "OUT_OF_TOLERANCE", nextCalibrationDate: "2027-01-01" }, NOW),
    "OUT_OF_SERVICE",
  );
  assert.equal(
    deriveInstrumentStatus({ verdict: "PASS", asFound: "IN_TOLERANCE", nextCalibrationDate: "2027-01-01" }, NOW),
    "CURRENT",
  );
});

test("the newest event wins on calibration date, ties broken by when it was recorded", () => {
  const a = { id: "a", calibrationDate: "2025-01-10", createdAt: "2025-01-10T09:00:00Z" };
  const b = { id: "b", calibrationDate: "2026-02-02", createdAt: "2026-02-02T09:00:00Z" };
  const c = { id: "c", calibrationDate: "2026-02-02", createdAt: "2026-02-02T15:00:00Z" };
  assert.equal(newestEvent([a, b, c])?.id, "c");
  assert.equal(newestEvent([c, a, b])?.id, "c");
  assert.equal(newestEvent([] as (typeof a)[]), null);
});

test("the auto-raised NC names the instrument and the whole suspect window", () => {
  const d = outOfToleranceNcDescription({
    instrumentName: "Vernier Caliper 300mm",
    serialNumber: "VC-9931",
    calibrationDate: "2026-08-01",
    verdict: "FAIL",
    asFound: "OUT_OF_TOLERANCE",
    asLeft: "ADJUSTED",
    certificateNumber: "CERT-2026-88",
    lastGoodDate: "2025-08-01",
    lastGoodIsRegistration: false,
  });
  assert.match(d, /Vernier Caliper 300mm/);
  assert.match(d, /VC-9931/);
  assert.match(d, /2025-08-01/);
  assert.match(d, /2026-08-01/);
  assert.match(d, /365 days/);
  assert.match(d, /validity/i);
  assert.match(d, /7\.1\.5\.2/);
  assert.match(d, /OUT OF SERVICE/);
});

test("with no prior passing calibration the NC falls back to the registration date", () => {
  const d = outOfToleranceNcDescription({
    instrumentName: "Torque Wrench",
    calibrationDate: "2026-08-01",
    verdict: "FAIL",
    asFound: "OUT_OF_TOLERANCE",
    asLeft: "REJECTED",
    lastGoodDate: "2026-01-01",
    lastGoodIsRegistration: true,
  });
  assert.match(d, /No previous in-tolerance calibration/);
  assert.match(d, /2026-01-01/);
  assert.match(d, /212 days/);
});

test("the next due date is the calibration date plus the interval", () => {
  assert.equal(addDays("2026-08-01", 365), "2027-08-01");
  assert.equal(addDays("2026-08-01", 182), "2027-01-30");
});
