// src/lib/__tests__/route-gates.test.ts
// AGENTS.md §5: "Gate every mutating API route. A route that writes without a
// role gate is a bug."
//
// That rule was written down and then checked by reading, which does not scale
// past a hundred routes and does not survive a new one being added at speed by
// whoever is working next. A rule a machine does not enforce is a rule that
// holds until somebody is in a hurry.
//
// So this walks every route handler in the tree and fails if a POST, PATCH, PUT
// or DELETE can be reached without an authorisation call. It is a coverage
// check, not a correctness one: it proves a gate is present, not that the gate
// names the right roles. The exemptions below are the routes that are public on
// purpose, each with the reason, so that making a route public stays a decision
// somebody has to write down here rather than an omission nobody notices.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API = join(process.cwd(), "src", "app", "api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

// Comments are stripped before scanning. Several of these routes explain their
// own authorisation model in prose, and a guard that reads its own
// documentation as evidence is a guard that passes when the code is deleted.
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// The calls that establish who is asking. requireRoles is the house pattern;
// the others appear where a route needs the session for something other than a
// role check and does its own comparison.
const GATE = /\brequireRoles\s*\(|\brequireAuth\s*\(|\bauth\s*\(\s*\)/;

// Public on purpose. Each entry is a decision with a reason, not a to-do.
//
// NextAuth's own handler is deliberately absent: it exports its handlers rather
// than declaring them, so it never trips the scan and an exemption for it would
// be inert — an entry that looks like a considered decision while protecting
// nothing.
const DELIBERATELY_PUBLIC: Record<string, string> = {
  "auth/forgot-password": "a person who cannot log in is the only caller there is",
  "auth/reset-password": "guarded by the single-use token in the link, not by a session",
};

const key = (f: string) =>
  relative(API, f).split(sep).slice(0, -1).join("/");

test("every mutating API route is gated", () => {
  const files = routeFiles(API);

  // A sanity floor. If a refactor moves the API tree, the walk would return
  // nothing and this test would pass by finding no work to do.
  assert.ok(files.length > 50, `only ${files.length} route files found — has the API tree moved?`);

  const ungated: string[] = [];
  for (const file of files) {
    const code = strip(readFileSync(file, "utf8"));
    const verbs = [...code.matchAll(/export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/g)].map(
      (m) => m[1],
    );
    if (verbs.length === 0) continue;
    if (key(file) in DELIBERATELY_PUBLIC) continue;
    if (!GATE.test(code)) ungated.push(`${key(file)} [${verbs.join(", ")}]`);
  }

  assert.deepEqual(
    ungated,
    [],
    `these routes write without establishing who is asking:\n  ${ungated.join("\n  ")}`,
  );
});

test("every exemption is load-bearing, which is what proves the scan works", () => {
  // Two jobs in one assertion. An exemption for a route that has been deleted,
  // or that has since grown a proper gate, is a hole waiting for a future route
  // at that path to inherit a pass it never earned.
  //
  // And the same check is the only evidence the scan above is falsifiable. A
  // file-scanning guard that has never rejected anything is indistinguishable
  // from one whose pattern never matches. Each exemption named here is a real
  // route, with a real mutating handler, and genuinely no gate — so the scan
  // demonstrably reaches and would fail such a route.
  const byKey = new Map(routeFiles(API).map((f) => [key(f), f]));

  for (const path of Object.keys(DELIBERATELY_PUBLIC)) {
    const file = byKey.get(path);
    assert.ok(file, `${path} is exempted but no longer exists — drop the exemption`);

    const code = strip(readFileSync(file, "utf8"));
    assert.match(
      code,
      /export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/,
      `${path} is exempted but writes nothing — the exemption protects nothing, drop it`,
    );
    assert.ok(
      !GATE.test(code),
      `${path} now carries a gate — drop the exemption so the scan covers it`,
    );
  }
});

test("a GET-only route is not required to carry a gate", () => {
  // Stated so the intent of this file is not mistaken for "authenticate
  // everything". Read access is handled by the proxy, which already requires a
  // session for everything except the scan passport. This test would be
  // meaningless if the rule above were accidentally widened to GET.
  const sample = strip(readFileSync(join(API, "equipment", "next-id", "route.ts"), "utf8"));
  assert.ok(
    !/export\s+async\s+function\s+(POST|PATCH|PUT|DELETE)\b/.test(sample),
    "next-id has gained a mutating handler — it now needs a gate",
  );
});
