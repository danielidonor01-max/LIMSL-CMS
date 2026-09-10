// src/lib/hse/risk-matrix.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rate,
  riskBand,
  blockingSteps,
  ineffectiveControls,
  bandFromLegacy,
  LIKELIHOOD,
  SEVERITY,
} from "./risk-matrix";

test("both scales are 1 to 5 with no gaps", () => {
  // The score is likelihood x severity, so a gap in either scale silently
  // changes which bands are reachable.
  assert.deepEqual(LIKELIHOOD.map((l) => l.value), [1, 2, 3, 4, 5]);
  assert.deepEqual(SEVERITY.map((s) => s.value), [1, 2, 3, 4, 5]);
});

test("every reachable score lands in exactly one band", () => {
  const seen = new Set<number>();
  for (const l of LIKELIHOOD) for (const s of SEVERITY) seen.add(l.value * s.value);
  for (const score of seen) {
    const band = riskBand(score);
    assert.ok(["LOW", "MEDIUM", "HIGH", "EXTREME"].includes(band), `${score} has no band`);
  }
  // The boundaries, spelled out, because an off-by-one here changes whether a
  // job is allowed to proceed.
  assert.equal(riskBand(4), "LOW");
  assert.equal(riskBand(5), "MEDIUM");
  assert.equal(riskBand(9), "MEDIUM");
  assert.equal(riskBand(10), "HIGH");
  assert.equal(riskBand(15), "HIGH");
  assert.equal(riskBand(16), "EXTREME");
  assert.equal(riskBand(25), "EXTREME");
});

test("a rating off the scale is refused rather than clamped", () => {
  // Clamping would turn a typo into a plausible-looking rating. Hot work scored
  // 5 x 6 by accident must not silently become 5 x 5.
  for (const bad of [0, 6, -1, 2.5, "3", null, undefined, NaN]) {
    assert.equal(rate(bad, 3), null, `likelihood ${String(bad)} should be refused`);
    assert.equal(rate(3, bad), null, `severity ${String(bad)} should be refused`);
  }
  assert.deepEqual(rate(4, 5), { likelihood: 4, severity: 5, score: 20, band: "EXTREME" });
});

test("a step still extreme after its controls blocks the analysis", () => {
  const steps = [
    { step: "Purge the line", initial: rate(5, 5), residual: rate(1, 5) },
    { step: "Cut the vessel", initial: rate(5, 5), residual: rate(4, 5) },
  ];
  assert.deepEqual(blockingSteps(steps), ["Cut the vessel"]);
});

test("an unnamed step is still identifiable when it blocks", () => {
  // The message has to name something a person can find, or it just says "no".
  const steps = [{ initial: rate(5, 5), residual: rate(5, 5) }];
  assert.deepEqual(blockingSteps(steps), ["Step 1"]);
});

test("a control that does not lower the rating is flagged but not blocked", () => {
  // Some hazards genuinely cannot be reduced further, and the honest record
  // says so. It is still the first thing an auditor asks about.
  const steps = [
    { step: "Grinding", initial: rate(3, 3), residual: rate(3, 3) },
    { step: "Lifting", initial: rate(4, 4), residual: rate(2, 4) },
  ];
  assert.deepEqual(ineffectiveControls(steps), ["Grinding"]);
  assert.deepEqual(blockingSteps(steps), []);
});

test("a step with only one of the two ratings is not judged", () => {
  // Half-scored is not evidence of anything, and calling it ineffective would
  // be a false accusation against a control that was simply not rated yet.
  const steps = [{ step: "Half done", initial: rate(4, 4), residual: null }];
  assert.deepEqual(ineffectiveControls(steps), []);
  assert.deepEqual(blockingSteps(steps), []);
});

test("records written before the matrix keep their band and gain no invented score", () => {
  assert.equal(bandFromLegacy("LOW"), "LOW");
  assert.equal(bandFromLegacy("high"), "HIGH");
  assert.equal(bandFromLegacy(" Medium "), "MEDIUM");
  assert.equal(bandFromLegacy("moderate"), null);
  assert.equal(bandFromLegacy(""), null);
  assert.equal(bandFromLegacy(null), null);
});
