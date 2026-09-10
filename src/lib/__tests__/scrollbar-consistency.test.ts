// src/lib/__tests__/scrollbar-consistency.test.ts
// The scrollbar is UI too.
//
// Every other control in this app is drawn by the app, and one element was not:
// the scroll track on the sidebar, which Windows renders as a light grey slab
// with arrow buttons and which sat directly on the near-black navigation. It
// was flagged in the first design audit and survived three passes, because a
// scrollbar belongs to no component and so belongs to nobody.
//
// It has one owner now, globals.css, and these are the three ways it comes
// back: dropping the standard properties (Firefox reverts), dropping the
// ::-webkit rules (Chrome and Edge revert), or someone deciding the tidy answer
// is to hide it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const CSS = readFileSync(join(SRC, "app", "globals.css"), "utf8");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

test("both halves of the scrollbar treatment are present", () => {
  // Firefox implements neither ::-webkit pseudo-element; Chrome only shipped
  // the standard properties in 121. Neither half covers the other, so losing
  // one hands a whole browser family the operating system's bar back and the
  // app looks fine to whoever made the change.
  for (const rule of ["scrollbar-width:", "scrollbar-color:"]) {
    assert.ok(CSS.includes(rule), `globals.css no longer sets ${rule} — Firefox reverts to the native bar`);
  }
  for (const rule of ["::-webkit-scrollbar", "::-webkit-scrollbar-thumb"]) {
    assert.ok(CSS.includes(rule), `globals.css no longer styles ${rule} — Chrome and Edge revert to the native bar`);
  }
});

test("the standard properties stay behind the @supports gate", () => {
  // The one that was actually shipped and caught in a screenshot. Chrome
  // ignores every ::-webkit-scrollbar rule on an element that also carries
  // scrollbar-color or scrollbar-width, and falls back to the operating
  // system's bar with its arrow buttons. Lifting these two properties out of
  // the gate reads like tidying up and un-styles the scrollbar in Chrome and
  // Edge, while Firefox keeps looking correct to whoever made the change.
  const GATE = "@supports not selector(::-webkit-scrollbar)";
  const gate = CSS.indexOf(GATE);
  assert.notEqual(gate, -1, "the @supports gate is gone — Chrome and Edge revert to the native scrollbar");

  let depth = 0;
  let end = -1;
  for (let i = CSS.indexOf("{", gate); i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  assert.notEqual(end, -1, "the @supports gate is never closed");

  const stray = [...CSS.matchAll(/scrollbar-(width|color):/g)]
    .filter((m) => m.index! < gate || m.index! > end)
    .map((m) => m[0]);

  assert.deepEqual(
    stray,
    [],
    `these are outside ${GATE}, so Chrome will ignore the ::-webkit rules and use the native bar:\n${stray.join("\n")}`,
  );
});

test("the dark column has its own thumb colour, and uses it", () => {
  // The ink ramp is tuned for marks on white. Reusing it here paints a light
  // grey thumb on #10131c, which is the seam the whole exercise removes.
  assert.ok(CSS.includes("--color-nav-scroll:"), "the nav thumb colour is gone");
  assert.ok(CSS.includes(".scroll-nav"), "the dark scrollbar variant is gone");

  const sidebar = readFileSync(join(SRC, "components", "Sidebar.tsx"), "utf8");
  const scrolling = sidebar
    .split("\n")
    .filter((l) => /overflow-y-auto|overflow-auto/.test(l));

  assert.ok(scrolling.length > 0, "Sidebar has no scroll container — this guard is now pointed at nothing");
  for (const line of scrolling) {
    assert.ok(
      line.includes("scroll-nav"),
      `a scroll container on the dark navigation is missing scroll-nav:\n${line.trim()}`,
    );
  }
});

test("no scroll container hides its scrollbar outright", () => {
  // The tidy-looking fix, and the wrong one. The sidebar carries twenty-odd
  // destinations across five sections; the bar is the only thing on screen
  // saying there is more of it below the fold.
  const offenders: string[] = [];

  const hidden = /scrollbar-width:\s*none|scrollbar-hide|scrollbar-none|::-webkit-scrollbar\s*{[^}]*display:\s*none/;
  for (const file of [...walk(SRC).filter((f) => !f.includes("__tests__")), join(SRC, "app", "globals.css")]) {
    const text = readFileSync(file, "utf8");
    if (hidden.test(text)) offenders.push(file.replace(SRC, "src"));
  }

  assert.deepEqual(
    offenders,
    [],
    `a hidden scrollbar removes the only signal that there is more content:\n${offenders.join("\n")}`,
  );
});
