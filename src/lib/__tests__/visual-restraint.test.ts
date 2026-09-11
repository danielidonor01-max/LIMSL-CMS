// src/lib/__tests__/visual-restraint.test.ts
// A ratchet for the interface rebuild.
//
// The scan passport was rebuilt by measuring first: 17 uppercase labels, 22
// monospace spans and 17 captions below the readable floor went to zero, and
// the numbers were the argument. That worked on one page. The same measurement
// across the whole app says the problem is roughly fifty times larger:
//
//   14 distinct font sizes, where the standards doc declares 6
//   71% of all text at 12px or smaller
//   148 uppercase labels across 48 files
//   161 monospace spans
//   7 border-radius steps, 6 shadow steps
//
// None of that is about which colours we pick. An interface with fourteen font
// sizes looks unconsidered in any palette, because eleven, twelve and thirteen
// pixels next to each other is not a hierarchy anybody can perceive — it just
// reads as slightly wrong without saying why.
//
// So this file counts, and the counts only go down. It deliberately does NOT
// assert which values are correct: that is settled by the design work, and
// pinning it here would mean editing this file every time a decision lands.
// What it pins is RESTRAINT — how many different answers the app gives to the
// same question. Lower the ceiling as each sweep finishes; never raise it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") && !full.includes("__tests__")) out.push(full);
  }
  return out;
}

// Print is measured separately and held to different limits. Paper is roughly
// 300dpi and a screen is not, so 10px on an A4 permit is legible where the same
// value on a phone is not. Sweeping these to match the screen floor would make
// the printed ISO documents worse to serve a number.
const isPrint = (f: string) =>
  /[\\/]print[\\/]/.test(f) ||
  /PrintableReport|PermitRenewalGrid|DocumentSeal/.test(f) ||
  /[\\/]qr[\\/]/.test(f);

const SCREEN = walk(join(SRC, "app"))
  .concat(walk(join(SRC, "components")))
  .filter((f) => !isPrint(f));

const read = (files: string[]) => files.map((f) => readFileSync(f, "utf8")).join("\n");
const screenSource = read(SCREEN);

const countAll = (source: string, re: RegExp) => (source.match(re) ?? []).length;
const distinct = (source: string, re: RegExp) => new Set(source.match(re) ?? []);

// ── The ceilings ──────────────────────────────────────────────────────────────
// Each is the measured value on 11 September 2026, the day before the rebuild.
// Lower them as sweeps land. A failure here means the app grew a new way of
// saying something it could already say.
// Lowered after the first sweep. Uppercase, monospace and sub-12px type are
// now ZERO on screen, so the ceiling is zero: there is no "a few is fine" here.
// Each one was removed for a reason that does not stop applying to the next
// instance somebody adds.
//
// Print keeps its own treatment and is excluded above — an A4 permit at 300dpi
// is a different reading problem from a phone in a workshop.
const CEILING = {
  fontSizes: 6,
  uppercase: 0,
  mono: 0,
  radiusSteps: 7,
  shadowSteps: 6,
  belowFloor: 0,
};

test("the app does not keep inventing new font sizes", () => {
  const sizes = distinct(
    screenSource,
    /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b|text-\[[0-9.]+(px|rem)\]/g,
  );
  assert.ok(
    sizes.size <= CEILING.fontSizes,
    `${sizes.size} distinct font sizes, ceiling is ${CEILING.fontSizes}:\n  ${[...sizes].sort().join("  ")}`,
  );
});

test("nothing on screen drops below the readable floor", () => {
  // 11px is the floor the standards doc sets, and it was raised to there once
  // already. Anything under it is read by somebody holding a phone in a glove
  // in a workshop with the doors open.
  const below = countAll(screenSource, /text-\[(?:[0-9]|10)(?:\.[0-9]+)?px\]/g);
  assert.ok(
    below <= CEILING.belowFloor,
    `${below} uses below the 11px floor on screen, ceiling is ${CEILING.belowFloor}`,
  );
});

test("uppercase labels are not multiplying", () => {
  // A tracked-out capital label is the commonest tell of a generated interface,
  // and it is harder to read at a glance than the sentence case it replaced.
  const count = countAll(screenSource, /\buppercase\b/g);
  assert.ok(
    count <= CEILING.uppercase,
    `${count} uppercase treatments on screen, ceiling is ${CEILING.uppercase}`,
  );
});

test("monospace stays for data, not for decoration", () => {
  // An asset tag in monospace is an alignment decision. A caption in monospace
  // is a costume.
  const count = countAll(screenSource, /\bfont-mono\b/g);
  assert.ok(count <= CEILING.mono, `${count} monospace spans on screen, ceiling is ${CEILING.mono}`);
});

test("cards agree with each other about how round they are", () => {
  const steps = distinct(screenSource, /\brounded(?:-(?:sm|md|lg|xl|2xl|3xl|full))?\b/g);
  assert.ok(
    steps.size <= CEILING.radiusSteps,
    `${steps.size} border-radius steps, ceiling is ${CEILING.radiusSteps}:\n  ${[...steps].sort().join("  ")}`,
  );
});

test("there is one shadow, not a collection", () => {
  const steps = distinct(screenSource, /\bshadow(?:-(?:sm|md|lg|xl|2xl|card|none))?\b/g);
  assert.ok(
    steps.size <= CEILING.shadowSteps,
    `${steps.size} shadow steps, ceiling is ${CEILING.shadowSteps}:\n  ${[...steps].sort().join("  ")}`,
  );
});

test("the ceilings describe the app as it actually is", () => {
  // A ratchet set far above the real numbers ratchets nothing: it would sit
  // green through a doubling. Each ceiling has to stay within reach of the
  // measurement, so that drift fails before it becomes the new normal.
  const measured = {
    fontSizes: distinct(
      screenSource,
      /\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl)\b|text-\[[0-9.]+(px|rem)\]/g,
    ).size,
    uppercase: countAll(screenSource, /\buppercase\b/g),
    mono: countAll(screenSource, /\bfont-mono\b/g),
    belowFloor: countAll(screenSource, /text-\[(?:[0-9]|10)(?:\.[0-9]+)?px\]/g),
    radiusSteps: distinct(screenSource, /\brounded(?:-(?:sm|md|lg|xl|2xl|3xl|full))?\b/g).size,
    shadowSteps: distinct(screenSource, /\bshadow(?:-(?:sm|md|lg|xl|2xl|card|none))?\b/g).size,
  };

  const slack: string[] = [];
  for (const [key, value] of Object.entries(measured)) {
    const ceiling = CEILING[key as keyof typeof CEILING];
    // A quarter of headroom is generous for a count that should only fall.
    if (value < ceiling * 0.75) slack.push(`${key}: measured ${value}, ceiling ${ceiling}`);
  }

  assert.deepEqual(
    slack,
    [],
    `these ceilings have drifted above the real numbers — lower them so they still catch regressions:\n  ${slack.join("\n  ")}`,
  );
});
