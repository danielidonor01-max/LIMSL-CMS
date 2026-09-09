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
import { join } from "node:path";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).filter((f) => !f.includes("__tests__"));

test("no page builds its own pill-in-a-track tab strip", () => {
  // The exact shape both list pages had grown independently: a row of buttons
  // in a grey rounded track, the active one filled.
  const offenders = FILES.filter((f) => /bg-ink-100[^"'`]*p-1[^"'`]*rounded-lg/.test(readFileSync(f, "utf8")));
  assert.deepEqual(
    offenders.map((f) => f.replace(SRC, "src")),
    [],
    "use the shared Tabs component rather than a private pill strip",
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
