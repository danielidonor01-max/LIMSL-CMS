// src/lib/__tests__/contrast.test.ts
// The 4.5:1 floor, measured rather than asserted.
//
// That floor has been claimed in comments across this codebase for months and
// nothing ever checked it. It survived because the palette aliased Tailwind's
// slate ramp, whose ratios are known good — so the claim was true by accident,
// not by construction. The moment the ramp became real hex values chosen for
// hue, the accident stopped protecting anything.
//
// It nearly went wrong immediately: Giov's own muted text, #8a8e89, measures
// 3.33:1 on white. Adopting their palette verbatim would have put every caption
// in the app under the line, and it would have looked fine to everybody who
// was not holding a phone in a workshop.
//
// WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and for non-text
// controls a user has to see to operate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** The literal hex behind a token, following one level of var() indirection. */
function token(name: string): string {
  const direct = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{3,8})`));
  if (direct) return direct[1];
  const alias = css.match(new RegExp(`--color-${name}:\\s*var\\(--color-([\\w-]+)\\)`));
  assert.ok(alias, `--color-${name} is neither a hex value nor an alias`);
  return token(alias![1]);
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const round = (n: number) => Math.round(n * 100) / 100;

test("the contrast maths agrees with the published WCAG examples", () => {
  // A checker that is wrong in the safe direction is worse than none, because
  // it certifies. These three are from the WCAG 2.1 definition itself.
  assert.equal(round(contrast("#ffffff", "#000000")), 21);
  assert.equal(round(contrast("#ffffff", "#ffffff")), 1);
  assert.equal(round(contrast("#777777", "#ffffff")), 4.48); // the classic near-miss
});

test("every text grey clears 4.5:1 on both grounds it can land on", () => {
  // "Both" is the point. A caption sits on a white card on some screens and
  // directly on the canvas on others, and a rule that depends on remembering
  // which is a rule that gets broken.
  const white = token("surface");
  const canvas = token("canvas");
  const failures: string[] = [];

  for (const step of ["500", "600", "700", "800", "900", "950"]) {
    const colour = token(`ink-${step}`);
    for (const [groundName, ground] of [["surface", white], ["canvas", canvas]] as const) {
      const r = contrast(colour, ground);
      if (r < 4.5) failures.push(`ink-${step} ${colour} on ${groundName} ${ground}: ${round(r)}:1`);
    }
  }

  assert.deepEqual(failures, [], `text below the 4.5:1 floor:\n  ${failures.join("\n  ")}`);
});

test("ink-400 and lighter are not usable as text, and nothing pretends otherwise", () => {
  // Stated so the ramp's shape is explicit. These steps are for borders,
  // dividers and disabled states. If one ever clears 4.5:1 the ramp has been
  // compressed and the steps above it have lost their separation.
  const white = token("surface");
  for (const step of ["100", "200", "300", "400"]) {
    assert.ok(
      contrast(token(`ink-${step}`), white) < 4.5,
      `ink-${step} is dark enough to read as text — the ramp has lost its spacing`,
    );
  }
});

test("the navigation column carries its own floor", () => {
  const nav = token("nav");
  const pairs: [string, number][] = [
    ["nav-text", 4.5],
    ["nav-label", 4.5],
    ["nav-text-active", 4.5],
    // The scroll thumb is a control, not text: 3:1 under WCAG 1.4.11. It was
    // previously nav-line, which measures 1.28:1 and is invisible.
    ["nav-scroll", 3.0],
  ];
  const failures: string[] = [];
  for (const [name, floor] of pairs) {
    const r = contrast(token(name), nav);
    if (r < floor) failures.push(`${name} ${token(name)} on nav: ${round(r)}:1, needs ${floor}`);
  }
  assert.deepEqual(failures, [], failures.join("\n  "));
});

test("the neutral ramp is warm, because the brand is green", () => {
  // A blue-grey beside an emerald accent is two hue families competing. This
  // is the one property of the palette that is a deliberate aesthetic choice
  // rather than a measurement, so it is pinned: reverting to slate would pass
  // every contrast test above and quietly undo the reason for the change.
  for (const step of ["200", "500", "700", "900"]) {
    const h = token(`ink-${step}`).replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    // Green is the highest channel, and blue never exceeds it. Slate fails
    // this at every step: slate-500 is #64748b, where blue leads by 39.
    //
    // Deliberately not asserting blue <= red. At ink-900 (#181a19) blue is one
    // unit above red, which is a rounding artefact at 1/255 and not a cast
    // anybody can see. A test that fails on noise gets relaxed by whoever hits
    // it next, and relaxed without care it stops guarding the real property.
    assert.ok(
      g >= r && g >= b,
      `ink-${step} (${token(`ink-${step}`)}) is not warm — green should be the highest channel`,
    );
  }
});
