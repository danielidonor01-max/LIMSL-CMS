// src/lib/__tests__/role-source-of-truth.test.ts
// AGENTS.md §4: "src/lib/roles.ts is canonical. Never hardcode a role list
// anywhere else."
//
// The rule exists because a permission written twice is a permission that will
// eventually be two different permissions. The way it actually failed here was
// not one careless list — it was FOUR lists in matched pairs: the permit renew
// route and the permit page each carried their own copy of who may renew, and
// the hand-back route and that same page each carried their own copy of who may
// accept a hand-back. They agreed on the day they were written.
//
// A pair like that fails silently and in the worse direction. Widen the list in
// the page and a button appears that the server answers with 403. Widen it in
// the route and the permission is granted to people the UI never offers it to,
// which is the one an auditor finds rather than a user.
//
// So: no role literal outside this module's own definition of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ROLES } from "@/lib/roles";

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const rel = (f: string) => relative(SRC, f).split(sep).join("/");

// Where a role name legitimately appears as a literal.
const ALLOWED = new Set([
  // The definitions themselves.
  "lib/roles.ts",
  // Chain declarations name the role each STEP requires. That is the chain's
  // content, and chains.ts is itself the single source of truth for it.
  "lib/signoff/chains.ts",
  // Translates the legacy "ADMIN" value stored on old rows to SUPER_ADMIN.
  // A migration mapping, not an authorisation decision.
  "auth.config.ts",
]);

// Seeds state which role each seeded person holds, and a training row carries a
// category that happens to be spelled "HSE". Both are data about individuals
// and records rather than rules about who may do what, so editing one cannot
// put a page and a route out of step. Exempted as a directory rather than file
// by file, so a new seed does not fail a check it was never the subject of.
const isSeed = (path: string) => path.startsWith("lib/db/seed");

// A role literal inside an array or an .includes() is a permission set being
// restated. Two or more in one expression is the pattern that actually bit.
const roleLiteral = new RegExp(`"(${ROLES.join("|")})"`, "g");

test("no permission set is restated outside roles.ts", () => {
  const offenders: string[] = [];

  for (const file of sourceFiles(SRC)) {
    if (ALLOWED.has(rel(file)) || isSeed(rel(file))) continue;
    const code = strip(readFileSync(file, "utf8"));

    // Array literals holding role names: ["SUPER_ADMIN", "HSE"].
    for (const m of code.matchAll(/\[[^\][]*\]/g)) {
      const hits = [...m[0].matchAll(roleLiteral)];
      if (hits.length >= 2) {
        offenders.push(`${rel(file)}: ${m[0].replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }

    // The same set written as a chain of comparisons:
    //   role === "QA_QC" || role === "SUPER_ADMIN"
    for (const m of code.matchAll(/[^;{}\n]*===\s*"[A-Z_]+"\s*\|\|[^;{}\n]*/g)) {
      const hits = [...m[0].matchAll(roleLiteral)];
      if (hits.length >= 2) {
        offenders.push(`${rel(file)}: ${m[0].trim().replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `import the set from @/lib/roles instead of restating it:\n  ${offenders.join("\n  ")}`,
  );
});

test("the permit page and the permit routes gate on the same sets", () => {
  // The specific pair that had drifted apart in waiting. Named explicitly so
  // that re-introducing a local copy fails with the reason attached, rather
  // than only as a generic pattern hit.
  const page = strip(readFileSync(join(SRC, "app", "permits", "[id]", "page.tsx"), "utf8"));
  const renew = strip(
    readFileSync(join(SRC, "app", "api", "permits", "[id]", "renew", "route.ts"), "utf8"),
  );
  const handback = strip(
    readFileSync(join(SRC, "app", "api", "permits", "[id]", "handback", "route.ts"), "utf8"),
  );

  for (const [name, code] of [["page", page], ["renew route", renew]] as const) {
    assert.match(code, /PERMIT_RENEW_ROLES/, `${name} no longer uses PERMIT_RENEW_ROLES`);
  }
  for (const [name, code] of [["page", page], ["handback route", handback]] as const) {
    assert.match(code, /PERMIT_ACCEPT_ROLES/, `${name} no longer uses PERMIT_ACCEPT_ROLES`);
  }
});

test("a role-dependent render is deferred past mount", () => {
  // The hydration trap AGENTS.md records as a real past bug. The session
  // resolves client-side only, so a permission read during SSR renders one
  // thing on the server and another on the client.
  const pages = sourceFiles(join(SRC, "app")).filter((f) => f.endsWith("page.tsx"));
  const offenders: string[] = [];

  for (const file of pages) {
    const code = strip(readFileSync(file, "utf8"));
    if (!/useSession\s*\(/.test(code)) continue;
    // Only pages that actually branch a render on the role.
    if (!/\b(can[A-Z]\w*|isAdmin|mayWrite)\s*=/.test(code)) continue;
    // Two ways to defer it, and the second is the stronger one. `mounted` lets
    // the page render with the permission false and fill it in afterwards;
    // returning early while the session is loading renders no permission-
    // dependent markup at all until the answer is known. The settings pages do
    // the latter, and demanding the flag from them as well would be cargo cult.
    const deferred = /\bmounted\b/.test(code) || /status\s*===\s*"loading"/.test(code);
    if (!deferred) offenders.push(rel(file));
  }

  assert.deepEqual(
    offenders,
    [],
    `these pages compute a permission from the session without the mounted guard:\n  ${offenders.join("\n  ")}`,
  );
});
