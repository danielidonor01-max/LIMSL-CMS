import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");

// The rule was written with :where(), which has zero specificity, so every
// local `focus:outline-none` — Tailwind emits `.focus\:outline-none:focus`, a
// class plus a pseudo-class — beat it. 47 of the 64 elements that clear the
// outline had no focus indicator at all, which is a WCAG 2.4.7 failure the
// original fix was written to prevent and silently did not.
test("the focus ring cannot be defeated by a local focus:outline-none", () => {
  const rule = css.match(/:where\([^)]*\):focus-visible\s*\{[^}]*\}/);
  assert.ok(rule, "the global :focus-visible rule must exist");
  assert.match(
    rule![0],
    /outline:\s*2px solid #059669\s*!important/,
    "the outline must be !important — a zero-specificity rule loses to every utility class",
  );
  assert.match(rule![0], /outline-offset:[^;]*!important/);
});

test("the ring covers every focusable element type the app uses", () => {
  const rule = css.match(/:where\(([^)]*)\):focus-visible/);
  assert.ok(rule);
  const selector = rule![1];
  for (const el of ["a", "button", "input", "textarea", "select", '[role="tab"]', "[tabindex]"]) {
    assert.ok(selector.includes(el), `${el} must be covered by the focus ring`);
  }
});
