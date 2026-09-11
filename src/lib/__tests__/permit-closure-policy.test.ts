// src/lib/__tests__/permit-closure-policy.test.ts
// Why there is no "Close all expired permits" button, and why adding one would
// be a step backwards.
//
// Audit finding H-08 asked for a batch close action on the permit list. It is
// the one finding in the review worth refusing, for two reasons.
//
// First, there is no backlog to clear. A permit's status is driven by its
// signatures and the calendar, never by a button: reconciliation runs on every
// permit list, every permit detail, the approvals inbox, checklist submission,
// work order updates and every escalation pass. An elapsed permit is already
// closed — as CLOSED_LATE if the job was done, as CLOSED_WORK_ONGOING with a
// successor raised if it was not — before anyone could press anything.
//
// Second, and the reason this file exists rather than a comment: closing a
// permit properly takes two signatures, the foreman confirming the area is
// clear and HSE confirming the isolation is removed and the equipment is safe
// to re-energise. A batch action that collected those in one click would be one
// person attesting to isolations they never walked out to check. That is the
// signature an incident investigation reads first, and a system that makes it
// cheap to give is worse than one that makes it slow.
//
// The permits that expired with nobody signing the site back to safe are not
// hidden either — each raises a non-conformity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PTW_CLOSEOUT_CHAIN } from "@/lib/signoff/chains";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("closing a permit still takes two signatures from two different roles", () => {
  // The control this whole policy rests on. If the close-out chain were ever
  // reduced to one step, a batch action would stop being obviously wrong and
  // somebody would reasonably add one.
  assert.equal(PTW_CLOSEOUT_CHAIN.length, 2);
  assert.deepEqual(
    PTW_CLOSEOUT_CHAIN.map((s) => s.role),
    ["FOREMAN", "HSE"],
  );
  for (const step of PTW_CLOSEOUT_CHAIN) {
    assert.equal(step.required, true, `${step.roleLabel} must stay required`);
  }
});

test("no route signs or closes permits in bulk", () => {
  // A bulk endpoint is how this would actually arrive: not as a button somebody
  // argued for, but as a helper added to make a screen faster.
  const offenders: string[] = [];

  for (const file of walk(join(SRC, "app", "api"))) {
    const code = strip(readFileSync(file, "utf8"));
    if (!/permits/i.test(code)) continue;
    // A write that touches permits without narrowing to one id.
    for (const m of code.matchAll(/\b(closeAll|bulkClose|closeExpired|signAll|batchSign)\b/g)) {
      offenders.push(`${file.slice(SRC.length + 1)}: ${m[1]}`);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `permits close one at a time, each with its own two signatures:\n  ${offenders.join("\n  ")}`,
  );
});

test("expiry closure is reconciliation's job, and reconciliation runs unprompted", () => {
  // The claim that there is no backlog to clear only holds while something
  // actually runs. If every one of these call sites disappeared, expired
  // permits would sit open and a batch button would start looking necessary.
  const callers = walk(join(SRC))
    .filter((f) => !f.endsWith("permit-reconcile.ts"))
    .filter((f) => /\breconcilePermits\s*\(/.test(strip(readFileSync(f, "utf8"))));

  assert.ok(
    callers.length >= 5,
    `only ${callers.length} places call reconcilePermits — expired permits may now sit open`,
  );

  // The list page in particular: this is the screen H-08 wanted a button on,
  // and it reconciles on load, which is what makes the button redundant.
  const permitsRoute = strip(readFileSync(join(SRC, "app", "api", "permits", "route.ts"), "utf8"));
  assert.match(
    permitsRoute,
    /await\s+reconcilePermits\s*\(\s*\)/,
    "the permit list no longer reconciles on load",
  );
});

test("a permit that lapsed unsigned still raises a non-conformity", () => {
  // The safety net behind the refusal. Refusing the batch button is only
  // defensible while the permits it would have swept up are still visible as
  // findings rather than quietly closed.
  const reconcile = strip(
    readFileSync(join(SRC, "lib", "hse", "permit-reconcile.ts"), "utf8"),
  );
  assert.match(reconcile, /needsExpiryNonConformity\s*\(/);
  assert.match(reconcile, /raiseExpiryNonConformity\s*\(/);
});
