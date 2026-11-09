// src/lib/__tests__/figure.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFigure, formatFigure } from "../figure";

// Whatever the counter accepts it must draw back character for character.
const roundTrips = [
  "0", "7", "07", "007.5", "42", "92%", "3.5", "0.25", "1,234", "12,345.67",
  "-4", "-0.5", "+3", "₦1,200", "≥ 200", "12 hrs", "4d", "100%", "1234",
];

for (const s of roundTrips) {
  test(`round-trips ${JSON.stringify(s)}`, () => {
    const f = parseFigure(s);
    assert.ok(f, `expected ${s} to be a figure`);
    assert.equal(formatFigure(f), s);
  });
}

test("keeps the decimals instead of rounding them away", () => {
  assert.deepEqual(parseFigure("3.5"), {
    prefix: "", num: 3.5, decimals: 1, padStart: 1, separator: "", suffix: "",
  });
});

test("keeps the unit instead of dropping it", () => {
  const f = parseFigure("92%");
  assert.equal(f?.num, 92);
  assert.equal(f?.suffix, "%");
});

test("keeps leading zeros", () => {
  assert.equal(parseFigure("07")?.padStart, 2);
});

test("groups only when the source grouped", () => {
  assert.equal(parseFigure("1,234")?.separator, ",");
  assert.equal(parseFigure("1234")?.separator, "");
});

test("accepts plain numbers", () => {
  assert.equal(formatFigure(parseFigure(3.5)!), "3.5");
  assert.equal(formatFigure(parseFigure(12)!), "12");
  assert.equal(parseFigure(Number.NaN), null);
  assert.equal(parseFigure(Infinity), null);
});

const refused = [
  "", "—", "None planned", "Not set",
  "LEE/PE/0012", "WO-2026-0038", "A12", "2026-11-09", "09/11/2026",
  "12-14", "1 of 3", "3/4", "4 / 0", "1.2e5", "1,23", "12h 30m", "Q1 2026", "v2",
];

for (const s of refused) {
  test(`leaves ${JSON.stringify(s)} as text`, () => {
    assert.equal(parseFigure(s), null);
  });
}

test("leaves null and undefined alone", () => {
  assert.equal(parseFigure(null), null);
  assert.equal(parseFigure(undefined), null);
});
