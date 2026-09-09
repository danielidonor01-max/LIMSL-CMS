// src/lib/__tests__/status-tone.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { countTone, totalTone, EMPTY_TONE } from "../status-tone";

test("a zero is never a status colour, whatever the field means", () => {
  for (const tone of ["danger", "warn", "brand", "info"] as const) {
    assert.equal(countTone(0, tone), EMPTY_TONE, tone);
  }
});

test("a real count keeps its status colour", () => {
  assert.equal(countTone(5, "danger"), "text-danger-600");
  assert.equal(countTone(1, "warn"), "text-warn-600");
  assert.equal(countTone(12, "brand"), "text-brand-600");
});

test("a missing or malformed count reads as empty rather than alarming", () => {
  // Number(undefined) is NaN, and NaN in a red 24px number is the worst
  // possible failure mode for a count nobody managed to compute.
  assert.equal(countTone(NaN, "danger"), EMPTY_TONE);
  assert.equal(countTone(Number("x"), "warn"), EMPTY_TONE);
});

test("a total is a scale, not a status", () => {
  assert.equal(totalTone(400), "text-ink-900");
  assert.equal(totalTone(0), EMPTY_TONE);
});

test("a negative count is still shown, since hiding it would hide the bug", () => {
  assert.equal(countTone(-2, "danger"), "text-danger-600");
});
