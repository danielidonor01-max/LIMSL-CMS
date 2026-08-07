// Regression tests for PM recurrence arithmetic. Getting the next planned date
// wrong silently corrupts the compliance/overdue figures, and the month-end
// clamp is the classic place to get it wrong.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPlannedDate } from "@/lib/schedule";

// ── Month-end clamping ───────────────────────────────────────────────────────

test("31 Jan + 1 month lands on the last day of February, never in March", () => {
  assert.equal(nextPlannedDate("2026-01-31", "MONTHLY"), "2026-02-28");
  assert.equal(nextPlannedDate("2028-01-31", "MONTHLY"), "2028-02-29"); // leap year
  for (const year of ["2026", "2027", "2028", "2029"]) {
    const next = nextPlannedDate(`${year}-01-31`, "MONTHLY");
    assert.ok(next?.startsWith(`${year}-02-`), `${year}-01-31 + 1 month spilled to ${next}`);
  }
});

test("a 31st clamps into any shorter target month", () => {
  assert.equal(nextPlannedDate("2026-03-31", "MONTHLY"), "2026-04-30");
  assert.equal(nextPlannedDate("2026-05-31", "MONTHLY"), "2026-06-30");
  assert.equal(nextPlannedDate("2026-01-31", "QUARTERLY"), "2026-04-30");
  assert.equal(nextPlannedDate("2026-08-31", "SEMI_ANNUAL"), "2027-02-28");
});

test("a day that exists in the target month is preserved exactly", () => {
  assert.equal(nextPlannedDate("2026-01-15", "MONTHLY"), "2026-02-15");
  assert.equal(nextPlannedDate("2026-01-28", "MONTHLY"), "2026-02-28");
  assert.equal(nextPlannedDate("2026-04-30", "MONTHLY"), "2026-05-30");
});

test("a leap day rolls to 28 Feb on a non-leap anniversary", () => {
  assert.equal(nextPlannedDate("2028-02-29", "ANNUAL"), "2029-02-28");
  assert.equal(nextPlannedDate("2028-02-29", "MONTHLY"), "2028-03-29");
});

test("clamping is lossy — the programme does not spring back to the 31st", () => {
  // Documented consequence of clamping: stepping month by month from a 31st
  // settles on the clamped day rather than tracking each month's last day.
  const feb = nextPlannedDate("2026-01-31", "MONTHLY");
  assert.equal(feb, "2026-02-28");
  assert.equal(nextPlannedDate(feb, "MONTHLY"), "2026-03-28");
});

// ── Frequency table ──────────────────────────────────────────────────────────

test("each month-based frequency steps by its documented interval", () => {
  const base = "2026-01-15";
  const expected: Record<string, string> = {
    MONTHLY: "2026-02-15",
    BI_MONTHLY: "2026-03-15",
    BIMONTHLY: "2026-03-15",
    QUARTERLY: "2026-04-15",
    SEMI_ANNUAL: "2026-07-15",
    SEMIANNUAL: "2026-07-15",
    BI_ANNUAL: "2026-07-15",
    ANNUAL: "2027-01-15",
    YEARLY: "2027-01-15",
  };
  for (const [freq, want] of Object.entries(expected)) {
    assert.equal(nextPlannedDate(base, freq), want, `${freq} stepped wrong`);
  }
});

test("each day-based frequency steps by its documented interval", () => {
  const base = "2026-01-15";
  const expected: Record<string, string> = {
    DAILY: "2026-01-16",
    WEEKLY: "2026-01-22",
    BIWEEKLY: "2026-01-29",
    FORTNIGHTLY: "2026-01-29",
  };
  for (const [freq, want] of Object.entries(expected)) {
    assert.equal(nextPlannedDate(base, freq), want, `${freq} stepped wrong`);
  }
});

test("day-based steps roll over month and year boundaries", () => {
  assert.equal(nextPlannedDate("2026-01-31", "DAILY"), "2026-02-01");
  assert.equal(nextPlannedDate("2026-02-28", "DAILY"), "2026-03-01");
  assert.equal(nextPlannedDate("2028-02-28", "DAILY"), "2028-02-29"); // leap year
  assert.equal(nextPlannedDate("2026-12-31", "DAILY"), "2027-01-01");
  assert.equal(nextPlannedDate("2026-12-28", "WEEKLY"), "2027-01-04");
});

test("frequency matching tolerates case and stray whitespace", () => {
  assert.equal(nextPlannedDate("2026-01-15", "monthly"), "2026-02-15");
  assert.equal(nextPlannedDate("2026-01-15", "  Quarterly  "), "2026-04-15");
  assert.equal(nextPlannedDate("2026-01-15", "wEEkly"), "2026-01-22");
});

// ── Non-recurring and bad input ──────────────────────────────────────────────

test("an unknown or one-off frequency yields null rather than a guess", () => {
  for (const freq of ["ON_CONDITION", "AS_REQUIRED", "ONE_OFF", "", "   ", "MONTH", "ANNUALLY"]) {
    assert.equal(nextPlannedDate("2026-01-15", freq), null, `"${freq}" should not be recurring`);
  }
});

test("a missing date or frequency yields null", () => {
  assert.equal(nextPlannedDate(null, "MONTHLY"), null);
  assert.equal(nextPlannedDate(undefined, "MONTHLY"), null);
  assert.equal(nextPlannedDate("", "MONTHLY"), null);
  assert.equal(nextPlannedDate("2026-01-15", null), null);
  assert.equal(nextPlannedDate("2026-01-15", undefined), null);
});

test("an unparseable date yields null", () => {
  assert.equal(nextPlannedDate("not-a-date", "MONTHLY"), null);
  assert.equal(nextPlannedDate("2026-13-45", "MONTHLY"), null);
  assert.equal(nextPlannedDate("15/01/2026", "MONTHLY"), null);
});

test("a full ISO timestamp is accepted — only the date part is used", () => {
  assert.equal(nextPlannedDate("2026-01-15T00:00:00.000Z", "MONTHLY"), "2026-02-15");
  assert.equal(nextPlannedDate("2026-01-31T23:59:00", "MONTHLY"), "2026-02-28");
});

// ── Shape ────────────────────────────────────────────────────────────────────

test("every result is a zero-padded YYYY-MM-DD string that round-trips", () => {
  const freqs = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"];
  for (const freq of freqs) {
    for (const base of ["2026-01-01", "2026-01-09", "2026-09-30", "2026-12-31"]) {
      const next = nextPlannedDate(base, freq);
      assert.match(next ?? "", /^\d{4}-\d{2}-\d{2}$/, `${base} + ${freq} -> ${next}`);
      // The next occurrence always moves forward.
      assert.ok((next ?? "") > base, `${base} + ${freq} did not advance (${next})`);
    }
  }
});
