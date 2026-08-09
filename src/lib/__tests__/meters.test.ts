import { test } from "node:test";
import assert from "node:assert/strict";
import {
  meterState,
  usageRatePerDay,
  projectedDueDate,
  validateReading,
  isMeterUnit,
  METER_STATUS_LABELS,
  METER_STATUS_BADGE,
} from "@/lib/maintenance/meters";

test("a service becomes due as the interval is consumed", () => {
  // 500-hour interval, last serviced at 1000 hrs.
  assert.equal(meterState(1200, 1000, 500).status, "OK");
  assert.equal(meterState(1460, 1000, 500).status, "DUE_SOON"); // 92% used
  assert.equal(meterState(1500, 1000, 500).status, "DUE");
  assert.equal(meterState(1600, 1000, 500).status, "OVERDUE");
});

test("used, remaining and percent describe the same position", () => {
  const s = meterState(1250, 1000, 500);
  assert.equal(s.used, 250);
  assert.equal(s.remaining, 250);
  assert.equal(s.percent, 50);
});

test("overdue reports how far past, not a floor of zero", () => {
  const s = meterState(1750, 1000, 500);
  assert.equal(s.remaining, -250, "250 hours past due must be visible as such");
  assert.equal(s.percent, 100, "the bar caps, the number does not");
});

// A replaced meter reads lower than the last service. Treating that as negative
// usage would push the service out forever, the machine would never come due.
test("a meter that reads lower than the last service does not defer the service", () => {
  const s = meterState(50, 1000, 500);
  assert.equal(s.used, 0);
  assert.equal(s.status, "OK");
  assert.ok(s.remaining > 0);
});

test("no interval configured is said plainly rather than shown as due", () => {
  assert.equal(meterState(1200, 1000, null).status, "NOT_CONFIGURED");
  assert.equal(meterState(1200, 1000, 0).status, "NOT_CONFIGURED");
});

// Number(null) is 0, so an unread meter looked like a machine sitting at zero
// hours, reported as comfortably within interval. A green tick for an asset
// nobody has measured is the worst answer available.
test("an interval with no reading yet is NOT reported as within interval", () => {
  for (const v of [null, undefined, ""]) {
    const s = meterState(v as never, 1000, 500);
    assert.equal(s.status, "NO_READING", `${String(v)} must not read as OK`);
  }
  assert.notEqual(meterState(null, 1000, 500).status, "OK");
});

test("a machine never serviced is measured from zero", () => {
  const s = meterState(600, null, 500);
  assert.equal(s.used, 600);
  assert.equal(s.status, "OVERDUE");
});

test("every status has a label and a badge", () => {
  for (const k of ["OVERDUE", "DUE", "DUE_SOON", "OK", "NOT_CONFIGURED"] as const) {
    assert.ok(METER_STATUS_LABELS[k]?.length > 0);
    assert.ok(METER_STATUS_BADGE[k]?.length > 0);
  }
});

// ── Usage rate ───────────────────────────────────────────────────────────────
test("the usage rate comes from observed readings", () => {
  const rate = usageRatePerDay([
    { reading: 1000, readingDate: "2026-01-01" },
    { reading: 1300, readingDate: "2026-01-31" },
  ]);
  assert.equal(rate, 10, "300 hours over 30 days");
});

test("readings out of order are still handled", () => {
  const rate = usageRatePerDay([
    { reading: 1300, readingDate: "2026-01-31" },
    { reading: 1000, readingDate: "2026-01-01" },
  ]);
  assert.equal(rate, 10);
});

// A projection from a single point is a guess wearing a number's clothing.
test("fewer than two readings yields no rate rather than a fabricated one", () => {
  assert.equal(usageRatePerDay([]), null);
  assert.equal(usageRatePerDay([{ reading: 1000, readingDate: "2026-01-01" }]), null);
});

test("an idle machine or a reset meter yields no rate", () => {
  assert.equal(
    usageRatePerDay([
      { reading: 1000, readingDate: "2026-01-01" },
      { reading: 1000, readingDate: "2026-02-01" },
    ]),
    null,
  );
  assert.equal(
    usageRatePerDay([
      { reading: 1000, readingDate: "2026-01-01" },
      { reading: 20, readingDate: "2026-02-01" },
    ]),
    null,
  );
});

test("two readings on the same day cannot produce a per-day rate", () => {
  assert.equal(
    usageRatePerDay([
      { reading: 1000, readingDate: "2026-01-01" },
      { reading: 1010, readingDate: "2026-01-01" },
    ]),
    null,
  );
});

test("malformed readings are ignored, not counted as zero", () => {
  assert.equal(usageRatePerDay([{ reading: NaN, readingDate: "bad" }, { reading: 5, readingDate: "2026-01-01" }]), null);
});

// ── Projection ───────────────────────────────────────────────────────────────
test("the due date follows real usage, so a hard-worked machine comes due sooner", () => {
  const from = new Date("2026-03-01T00:00:00Z");
  const busy = projectedDueDate(100, 10, from);   // 10 days
  const idle = projectedDueDate(100, 2, from);    // 50 days
  assert.equal(busy, "2026-03-11");
  assert.equal(idle, "2026-04-20");
});

test("no rate means no projected date, not today, and not never", () => {
  assert.equal(projectedDueDate(100, null), null);
  assert.equal(projectedDueDate(100, 0), null);
});

test("something already due projects to today rather than the past", () => {
  const from = new Date("2026-03-01T00:00:00Z");
  assert.equal(projectedDueDate(-40, 10, from), "2026-03-01");
});

test("an absurdly distant projection is withheld rather than printed", () => {
  assert.equal(projectedDueDate(1_000_000, 0.01), null);
});

// ── Reading validation ───────────────────────────────────────────────────────
test("a reading must move forward unless the meter was replaced", () => {
  const back = validateReading(900, 1000);
  assert.equal(back.ok, false);
  assert.equal(back.ok === false && back.error.includes("1000"), true, "the message must show the last reading");

  const reset = validateReading(5, 1000, true);
  assert.equal(reset.ok, true);
  assert.equal(reset.ok && reset.reading, 5);
});

test("forward and equal readings are accepted", () => {
  assert.equal(validateReading(1200, 1000).ok, true);
  assert.equal(validateReading(1000, 1000).ok, true);
});

test("junk readings are refused", () => {
  for (const v of ["", null, undefined, -5, "abc", NaN]) {
    assert.equal(validateReading(v, 100).ok, false, `${String(v)} is not a reading`);
  }
});

test("the first ever reading has nothing to compare against", () => {
  assert.equal(validateReading(4200, null).ok, true);
});

test("only the three known meter units are accepted", () => {
  assert.equal(isMeterUnit("HOURS"), true);
  assert.equal(isMeterUnit("cycles"), true);
  assert.equal(isMeterUnit("FURLONGS"), false);
  assert.equal(isMeterUnit(null), false);
});
