// src/lib/__tests__/premob-verification.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dueState,
  isPremobEligible,
  isVerificationEligible,
  referenceError,
  validatePremob,
  validateVerification,
} from "@/lib/premob-verification";

const TODAY = "2026-11-10";

test("premob is for cranes; verification is for welding machines and cranes", () => {
  assert.ok(isPremobEligible("CRANE"));
  assert.ok(!isPremobEligible("WELDING"));
  assert.ok(isVerificationEligible("CRANE"));
  assert.ok(isVerificationEligible("WELDING"));
  assert.ok(!isVerificationEligible("PRESS"));
  assert.ok(!isVerificationEligible(null));
});

test("due state turns amber within 30 days and red once past", () => {
  assert.equal(dueState(null, TODAY), "NONE");
  assert.equal(dueState("2027-03-01", TODAY), "CURRENT");
  assert.equal(dueState("2026-12-10", TODAY), "DUE_SOON");
  assert.equal(dueState(TODAY, TODAY), "DUE_SOON");
  assert.equal(dueState("2026-11-09", TODAY), "OVERDUE");
});

test("a premob needs a date, a vendor, a later due date and the certificate", () => {
  const ok = { premobDate: "2026-11-01", vendor: "Lifting Co", nextDueDate: "2027-05-01", proofFileKey: "k" };
  assert.equal(validatePremob(ok, TODAY), null);
  assert.match(validatePremob({ ...ok, proofFileKey: "" }, TODAY)!, /certificate/);
  assert.match(validatePremob({ ...ok, vendor: " " }, TODAY)!, /vendor/);
  assert.match(validatePremob({ ...ok, nextDueDate: "2026-11-01" }, TODAY)!, /after/);
  assert.match(validatePremob({ ...ok, premobDate: "2026-12-01" }, TODAY)!, /future/);
});

test("the reference instrument must be in calibration on the day", () => {
  const ref = { instrumentName: "Clamp meter", serialNumber: "1", nextCalibrationDate: "2027-01-01", status: "CURRENT" };
  assert.equal(referenceError(ref, TODAY), null);
  assert.match(referenceError(null, TODAY)!, /Choose/);
  assert.match(referenceError({ ...ref, status: "OUT_OF_SERVICE" }, TODAY)!, /out of service/);
  assert.match(referenceError({ ...ref, nextCalibrationDate: null }, TODAY)!, /no calibration/);
  assert.match(referenceError({ ...ref, nextCalibrationDate: "2026-11-01" }, TODAY)!, /lapsed/);
  // Lapsed today, but it was good on the day of an earlier verification.
  assert.equal(referenceError({ ...ref, nextCalibrationDate: "2026-11-01" }, "2026-10-20"), null);
});

test("a verification needs a result and at least one reading", () => {
  const readings = [{ parameter: "Current (A)", machine: "200", reference: "198", tolerance: "±5%" }];
  assert.equal(validateVerification({ verificationDate: TODAY, result: "PASS", readings }, TODAY), null);
  assert.match(validateVerification({ verificationDate: TODAY, result: "PASS", readings: [] }, TODAY)!, /reading/);
  assert.match(validateVerification({ verificationDate: TODAY, result: "MAYBE", readings }, TODAY)!, /passed/);
  assert.match(
    validateVerification({ verificationDate: TODAY, result: "PASS", readings, nextDueDate: TODAY }, TODAY)!,
    /after/,
  );
});
