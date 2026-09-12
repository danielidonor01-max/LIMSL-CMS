import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
const COMPONENTS = join(process.cwd(), "src", "components");

// The rule was written with :where(), which has zero specificity, so every
// local `focus:outline-none`. Tailwind emits `.focus\:outline-none:focus`, a
// class plus a pseudo-class, beat it. 47 of the 64 elements that clear the
// outline had no focus indicator at all, which is a WCAG 2.4.7 failure the
// original fix was written to prevent and silently did not.
test("the focus ring cannot be defeated by a local focus:outline-none", () => {
  const rule = css.match(/:where\([^)]*\):focus-visible\s*\{[^}]*\}/);
  assert.ok(rule, "the global :focus-visible rule must exist");
  assert.match(
    rule![0],
    /outline:\s*2px solid #059669\s*!important/,
    "the outline must be !important, a zero-specificity rule loses to every utility class",
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

test("anything that suppresses the outline replaces it with a visible one", () => {
  // The global rule is !important precisely so a utility class cannot quietly
  // remove it. There is exactly one place that overrides it anyway, and the
  // override is only defensible because it substitutes a STRONGER indicator:
  // the auth fields are borderless inputs inside a divided panel, where a 2px
  // outline with a 2px offset draws a box floating inside the cell, detached
  // from the label it belongs to. The ring moves to the cell, which encloses
  // the focused control and its label together.
  //
  // This test exists so that trade is never made silently again. Anything that
  // kills the outline has to show what it put in its place.
  // Every selector in the stylesheet that kills the outline. There should be
  // exactly one, and it should be the auth field.
  // Comments are stripped first. The override carries a long explanation
  // directly above it, and a selector match that starts at the previous `}`
  // swallows that comment whole — the guard would then be asserting against its
  // own documentation rather than against the rule.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const overrides = [...rules.matchAll(/([^{}]+)\{[^}]*outline:\s*none\s*!important[^}]*\}/g)].map(
    (m) => m[1].trim(),
  );
  assert.deepEqual(
    overrides,
    [".auth-field-input:focus-visible"],
    "only the auth field may override the global focus outline",
  );

  // A class plus a pseudo-class outranks :where() plus a pseudo-class. Written
  // as a bare element or with :where() it would lose, and the override would
  // silently do nothing — which is exactly how the original focus bug worked.
  assert.ok(
    !overrides[0].includes(":where("),
    "the override must not use :where(), which has zero specificity and would lose",
  );

  // And the replacement has to actually exist in the component.
  const field = readFileSync(join(COMPONENTS, "AuthField.tsx"), "utf8");
  assert.match(
    field,
    /auth-field-input/,
    "the override class is declared in CSS but no longer applied by AuthField",
  );
  assert.match(
    field,
    /focus-within:ring-2/,
    "AuthField suppresses the outline without providing a focus-within ring in its place",
  );
  assert.match(
    field,
    /focus-within:ring-inset/,
    "the replacement ring must be inset, or the panel that contains it clips the ring away",
  );
});
