// src/lib/hse/permit-validity.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  daysBetween,
  normaliseValidityDays,
  permitDays,
  expiryDateOf,
  isWithinWindow,
  isExpiredOn,
  daysRemaining,
  validateRenewal,
  renewalSummary,
  expiryDecision,
  workOngoingClosureNote,
  DEFAULT_PERMIT_VALIDITY_DAYS,
  type RenewalMarks,
} from "./permit-validity";

const START = "2026-08-04"; // a Tuesday
const SIG = "data:image/png;base64,AAAA";

test("a seven day permit covers seven calendar days including the weekend", () => {
  const days = permitDays(START, 7);
  assert.equal(days.length, 7);
  assert.deepEqual(days, [
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08", // Saturday
    "2026-08-09", // Sunday
    "2026-08-10",
  ]);
});

test("expiry is the last valid day, not the day after", () => {
  assert.equal(expiryDateOf(START, 7), "2026-08-10");
  assert.equal(isExpiredOn(START, 7, "2026-08-10"), false);
  assert.equal(isExpiredOn(START, 7, "2026-08-11"), true);
});

test("days remaining counts today as one of them and never goes negative", () => {
  assert.equal(daysRemaining(START, 7, "2026-08-04"), 7);
  assert.equal(daysRemaining(START, 7, "2026-08-10"), 1);
  assert.equal(daysRemaining(START, 7, "2026-08-11"), 0);
  assert.equal(daysRemaining(START, 7, "2026-09-01"), 0);
});

test("validity days fall back to seven and are clamped", () => {
  assert.equal(normaliseValidityDays(undefined), DEFAULT_PERMIT_VALIDITY_DAYS);
  assert.equal(normaliseValidityDays(null), DEFAULT_PERMIT_VALIDITY_DAYS);
  assert.equal(normaliseValidityDays(0), DEFAULT_PERMIT_VALIDITY_DAYS);
  assert.equal(normaliseValidityDays(-3), DEFAULT_PERMIT_VALIDITY_DAYS);
  assert.equal(normaliseValidityDays("14"), 14);
  assert.equal(normaliseValidityDays(365), 31);
});

test("date arithmetic crosses month and year boundaries", () => {
  assert.equal(addDays("2026-08-30", 3), "2026-09-02");
  assert.equal(addDays("2026-12-30", 5), "2027-01-04");
  assert.equal(daysBetween("2026-08-04", "2026-08-10"), 6);
  assert.equal(daysBetween("2026-08-10", "2026-08-04"), -6);
});

test("a day outside the validity window cannot be renewed", () => {
  const r = validateRenewal({
    startDate: START,
    validityDays: 7,
    date: "2026-08-11",
    today: "2026-08-11",
    status: "WORKED",
    time: "08:00",
    signatureData: SIG,
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /outside this permit's validity period/);
});

test("a future day cannot be renewed in advance", () => {
  const r = validateRenewal({
    startDate: START,
    validityDays: 7,
    date: "2026-08-07",
    today: "2026-08-05",
    status: "WORKED",
    time: "08:00",
    signatureData: SIG,
  });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.error : "", /before it arrives/);
});

test("a worked day needs a time and a signature", () => {
  const noTime = validateRenewal({
    startDate: START,
    validityDays: 7,
    date: "2026-08-05",
    today: "2026-08-05",
    status: "WORKED",
    time: "",
    signatureData: SIG,
  });
  assert.equal(noTime.ok, false);
  assert.match(noTime.ok === false ? noTime.error : "", /HH:MM/);

  const noSig = validateRenewal({
    startDate: START,
    validityDays: 7,
    date: "2026-08-05",
    today: "2026-08-05",
    status: "WORKED",
    time: "07:30",
  });
  assert.equal(noSig.ok, false);
  assert.match(noSig.ok === false ? noSig.error : "", /must sign/);
});

test("a malformed time is rejected rather than stored", () => {
  for (const bad of ["7:30", "25:00", "08:60", "0800", "morning"]) {
    const r = validateRenewal({
      startDate: START,
      validityDays: 7,
      date: "2026-08-05",
      today: "2026-08-05",
      status: "WORKED",
      time: bad,
      signatureData: SIG,
    });
    assert.equal(r.ok, false, `expected ${bad} to be rejected`);
  }
});

test("a day not worked is struck through with no time or signature", () => {
  const r = validateRenewal({
    startDate: START,
    validityDays: 7,
    date: "2026-08-08",
    today: "2026-08-10",
    status: "NOT_WORKED",
    signedByName: "K. Aloziero",
  });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.day.status, "NOT_WORKED");
    assert.equal(r.day.time, null);
    assert.equal(r.day.signatureData, null);
  }
});

test("overwriting a recorded day demands a written reason and keeps the old value", () => {
  const existing = {
    date: "2026-08-05",
    status: "WORKED" as const,
    time: "09:23",
    signedByName: "K. Aloziero",
  };

  const blocked = validateRenewal({
    startDate: START,
    validityDays: 7,
    date: "2026-08-05",
    today: "2026-08-06",
    status: "WORKED",
    time: "10:40",
    signatureData: SIG,
    existing,
  });
  assert.equal(blocked.ok, false);

  const amended = validateRenewal({
    startDate: START,
    validityDays: 7,
    date: "2026-08-05",
    today: "2026-08-06",
    status: "WORKED",
    time: "10:40",
    signatureData: SIG,
    existing,
    amendReason: "Time recorded against the wrong column at the toolbox talk.",
  });
  assert.equal(amended.ok, true);
  if (amended.ok) {
    assert.match(amended.day.amendedFrom ?? "", /09:23/);
    assert.match(amended.day.amendedFrom ?? "", /K\. Aloziero/);
  }
});

test("the summary separates days not worked from days nobody accounted for", () => {
  const marks: RenewalMarks = {
    "2026-08-04": { date: "2026-08-04", status: "WORKED", time: "08:00" },
    "2026-08-05": { date: "2026-08-05", status: "NOT_WORKED" },
  };
  const s = renewalSummary(START, 7, marks, "2026-08-07");
  assert.equal(s.worked, 1);
  assert.equal(s.notWorked, 1);
  assert.equal(s.unmarked, 5);
  assert.deepEqual(s.unaccounted, ["2026-08-06", "2026-08-07"]);
  assert.equal(s.expiresOn, "2026-08-10");
  assert.equal(s.expired, false);
});

test("an empty grid on day one has nothing unaccounted for yet", () => {
  const s = renewalSummary(START, 7, null, START);
  assert.equal(s.worked, 0);
  assert.equal(s.unmarked, 7);
  assert.deepEqual(s.unaccounted, [START]);
});

test("an expired permit with the work unfinished closes as work ongoing", () => {
  const d = expiryDecision({
    startDate: START,
    validityDays: 7,
    today: "2026-08-11",
    status: "ACTIVE",
    workComplete: false,
  });
  assert.deepEqual(d, { action: "CLOSE_WORK_ONGOING" });
});

test("an expired permit with the work finished closes as complete", () => {
  const d = expiryDecision({
    startDate: START,
    validityDays: 7,
    today: "2026-08-11",
    status: "ACTIVE",
    workComplete: true,
  });
  assert.deepEqual(d, { action: "CLOSE_COMPLETE" });
});

test("the warning fires with two days left, not on the morning it expires", () => {
  assert.deepEqual(
    expiryDecision({ startDate: START, validityDays: 7, today: "2026-08-08", status: "ACTIVE", workComplete: false }),
    { action: "NONE" },
  );
  assert.deepEqual(
    expiryDecision({ startDate: START, validityDays: 7, today: "2026-08-09", status: "ACTIVE", workComplete: false }),
    { action: "WARN", daysLeft: 2 },
  );
});

test("a closed or cancelled permit is left alone", () => {
  for (const status of ["CLOSED", "CANCELLED", "EXPIRED"]) {
    assert.deepEqual(
      expiryDecision({ startDate: START, validityDays: 7, today: "2026-09-01", status, workComplete: false }),
      { action: "NONE" },
    );
  }
});

test("a permit never approved still expires rather than waiting for a signature", () => {
  const d = expiryDecision({
    startDate: START,
    validityDays: 7,
    today: "2026-08-11",
    status: "PENDING_APPROVAL",
    workComplete: false,
  });
  assert.deepEqual(d, { action: "CLOSE_WORK_ONGOING" });
});

test("the closure note names the successor when there is one", () => {
  const s = renewalSummary(
    START,
    7,
    { "2026-08-04": { date: "2026-08-04", status: "WORKED", time: "08:00" } },
    "2026-08-11",
  );
  assert.match(workOngoingClosureNote(s), /closed as work ongoing/i);
  assert.match(workOngoingClosureNote(s, "PTW-2026-0042"), /Continued under PTW-2026-0042/);
});

test("the window boundaries are inclusive at both ends", () => {
  assert.equal(isWithinWindow(START, 7, "2026-08-04"), true);
  assert.equal(isWithinWindow(START, 7, "2026-08-10"), true);
  assert.equal(isWithinWindow(START, 7, "2026-08-03"), false);
  assert.equal(isWithinWindow(START, 7, "2026-08-11"), false);
});
