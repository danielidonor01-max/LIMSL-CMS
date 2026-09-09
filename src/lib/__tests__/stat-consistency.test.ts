// src/lib/__tests__/stat-consistency.test.ts
// Stops the design system drifting apart page by page.
//
// The re-audit's finding was not that any single page was wrong. It was that
// the same fix existed on some pages and not others: "Awaiting sign-off: 0"
// glowed amber on permits while the identical figure was correctly grey on
// corrective. Five modules had each grown a private Stat component with its own
// hardcoded colours, so a fix applied to one could not reach the rest.
//
// That is a structural problem and a review cannot hold it. Reviewers check
// what changed; nobody re-reads fourteen untouched pages to notice one of them
// still has the old pattern. A test can.
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

const PAGES = walk(join(SRC, "app")).filter((f) => f.endsWith("page.tsx"));

test("no page defines its own Stat component", () => {
  // Every one of these was a copy with slightly different colour rules. The
  // shared MetricPanel owns the zero rule, so a private copy is a page opting
  // out of it without saying so.
  const offenders = PAGES.filter((f) => /\bfunction Stat\s*\(|\bconst Stat\s*[:=]/.test(readFileSync(f, "utf8")));
  assert.deepEqual(
    offenders.map((f) => f.replace(SRC, "src")),
    [],
    "these pages have a private stat card; use MetricPanel so the zero rule applies",
  );
});

test("no page paints a big number in a status colour by hand", () => {
  // The shape the old cards all shared: a large bold figure with a status
  // colour baked in, which stays lit when the figure is zero.
  const pattern = /text-(?:2xl|3xl|4xl|5xl)[^"'`]*\btext-(danger|warn|brand|info)-\d{3}/;
  const offenders: string[] = [];

  for (const f of PAGES) {
    const src = readFileSync(f, "utf8");
    for (const line of src.split("\n")) {
      if (pattern.test(line)) offenders.push(`${f.replace(SRC, "src")}: ${line.trim().slice(0, 90)}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a figure this size carries status, so it must go through MetricPanel, which greys a zero:\n${offenders.join("\n")}`,
  );
});

test("MetricPanel still owns the zero rule", () => {
  // The guard above is only worth anything while the component it points at
  // actually applies the rule.
  const panel = readFileSync(join(SRC, "components", "MetricPanel.tsx"), "utf8");
  assert.ok(panel.includes("EMPTY_TONE"), "MetricPanel no longer greys empty counts");
  assert.ok(/count !== undefined/.test(panel), "MetricPanel no longer checks the count before colouring");
});

test("the dashboard hero greys its empty figures too", () => {
  // It has its own small stat row on the dark panel, and it was breaking the
  // rule the rest of the app follows.
  const hero = readFileSync(join(SRC, "components", "DashboardHero.tsx"), "utf8");
  assert.ok(/value === 0/.test(hero), "the hero sub-metrics no longer grey a zero");
});

test("no page builds a tinted figure card by hand", () => {
  // The first version of this guard looked for a status colour on the number
  // and for a private Stat component. It missed five more blocks that were the
  // same pattern in different clothes: a neutral figure on a tinted card, where
  // the TINT carries the status and stays lit when the count is nothing. The
  // re-audit found them; the guard did not, which is the guard's fault.
  //
  // The tell is a large figure and a status-tinted background in the same
  // block, so that is what this looks for.
  const offenders: string[] = [];

  for (const f of PAGES) {
    const lines = readFileSync(f, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const window = lines.slice(i, i + 6).join(" ");
      const bigFigure = /text-(?:2xl|3xl|4xl|5xl)\b[^"'`]*font-(?:bold|semibold|extrabold)/.test(window);
      const tinted = /\bbg-(danger|warn|brand|info)-50\b/.test(window);
      if (bigFigure && tinted) {
        offenders.push(`${f.replace(SRC, "src")}:${i + 1}`);
        i += 6;
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `a tinted card behind a figure is a stat card; use MetricPanel so an empty one stops shouting:\n${offenders.join("\n")}`,
  );
});
