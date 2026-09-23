// src/lib/__tests__/tabs-consistency.test.ts
// One control, one appearance.
//
// There were four ways to switch views: a white pill inside a grey track on the
// hazard analysis list, a tinted pill on the schedule, a filled brand button in
// settings, and an underline on the equipment record. Same control, same job,
// four appearances, so moving between two pages felt like moving between two
// applications.
//
// This is the same class of drift the stat cards had, and it recurs for the
// same reason: a pattern with no shared component is a pattern each page
// reinvents. The guard is what makes the shared component stick.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).filter(
  (f) =>
    !f.includes("__tests__") &&
    // The one place the pattern is allowed to exist, because it is the shared
    // control every other file is supposed to reach for.
    !f.endsWith(`components${sep}SegmentedControl.tsx`),
);

test("no page builds its own pill-in-a-track tab strip", () => {
  // The exact shape the list pages kept growing independently: a row of buttons
  // in a grey rounded track, the active one filled.
  //
  // This was written to expect the classes in the order the first offender
  // happened to write them — `p-1` before `rounded-lg` — and every one of the
  // six that appeared afterwards wrote `rounded-lg p-1`. The guard read clean
  // for months while the pattern spread to the register, notifications, the
  // schedule, the calendar, data import and emergency preparedness. A guard
  // that depends on class ORDER is a guard against one author's habit, not
  // against a pattern, so it matches either order now.
  const offenders = FILES.filter((f) => {
    const src = readFileSync(f, "utf8");
    return (
      /bg-ink-100[^"'`]*\bp-1\b[^"'`]*rounded-(?:lg|xl)/.test(src) ||
      /bg-ink-100[^"'`]*rounded-(?:lg|xl)[^"'`]*\bp-1\b/.test(src)
    );
  });
  assert.deepEqual(
    offenders.map((f) => f.replace(SRC, "src")),
    [],
    "use Tabs (moving between views of a page) or SegmentedControl (a filter or display mode) rather than a private pill strip",
  );
});

test("SegmentedControl is a real radiogroup, not a row of buttons that look like one", () => {
  // Same reasoning as Tabs: the value of one component is that the keyboard
  // behaviour is written once and correct. Exactly one option is always
  // chosen, which is a radiogroup rather than a tablist.
  const src = readFileSync(join(SRC, "components", "SegmentedControl.tsx"), "utf8");
  for (const needed of ['role="radiogroup"', 'role="radio"', "aria-checked", "ArrowRight", "ArrowLeft"]) {
    assert.ok(src.includes(needed), `SegmentedControl no longer provides ${needed}`);
  }
  assert.ok(
    /tabIndex=\{active \? 0 : -1\}/.test(src),
    "SegmentedControl must keep unselected segments out of the tab order",
  );
});

test("Tabs is a real tablist, not a row of buttons that look like one", () => {
  // The reason to have one component is not only that it looks the same
  // everywhere. It is that the keyboard behaviour is written once and correct:
  // arrows move, only the selected tab is in the tab order.
  const tabs = readFileSync(join(SRC, "components", "Tabs.tsx"), "utf8");
  for (const needed of ['role="tablist"', 'role="tab"', "aria-selected", "ArrowRight", "ArrowLeft"]) {
    assert.ok(tabs.includes(needed), `Tabs no longer provides ${needed}`);
  }
  assert.ok(/tabIndex=\{active \? 0 : -1\}/.test(tabs), "Tabs must keep unselected tabs out of the tab order");
});
