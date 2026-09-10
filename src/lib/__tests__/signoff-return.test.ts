// src/lib/__tests__/signoff-return.test.ts
// Returning a document for revision.
//
// The engine could always do this: the signoffs table has a REJECTED status and
// the route has handled `action: "reject"` since it was written. It was
// unreachable, because nothing in the interface ever offered it. A supervisor
// who wanted a small correction could approve the record or cancel it, and
// cancelling a work order to fix a typo in it is not a workflow.
//
// These are file-scan guards. The behaviour lives in an API route and a client
// component, and no database is reachable from here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const ROUTE = readFileSync(join(SRC, "app", "api", "signoffs", "[id]", "route.ts"), "utf8");
const CHAIN = readFileSync(join(SRC, "components", "SignoffChain.tsx"), "utf8");

test("the interface offers returning, not just signing", () => {
  // The capability existing server-side is worth nothing while the only button
  // says Sign.
  assert.ok(/Return with comment/.test(CHAIN), "the return action is not offered anywhere");
  assert.ok(/action: "reject"|action,/.test(CHAIN), "the component cannot send a rejection");
});

test("a return without a reason is refused", () => {
  // Sending something back with no comment tells the author only that it was
  // wrong, which sends them back to guess.
  assert.ok(
    /action === "reject" && comments\.length < 10/.test(ROUTE),
    "a rejection no longer requires a comment",
  );
});

test("a returned step can be signed once it is fixed", () => {
  // Only SIGNED blocks a step from being actioned again, so a returned record
  // recovers by being signed rather than needing an administrator to reset the
  // chain. If that guard ever widens to REJECTED, every returned document in
  // the system becomes permanently stuck.
  assert.ok(
    /step\.status === "SIGNED"[\s\S]{0,120}already signed/.test(ROUTE),
    "the already-actioned guard no longer names SIGNED alone",
  );
  assert.ok(
    !/step\.status !== "PENDING"/.test(ROUTE),
    "the route now refuses anything that is not PENDING, which strands returned records",
  );
  assert.ok(
    /status === "PENDING" \|\| returned/.test(CHAIN),
    "the interface no longer lets a returned step be signed after the fix",
  );
});

test("the reason it came back is shown on the record", () => {
  // Whoever has to fix it reads the record, not the audit log.
  assert.ok(/Returned by/.test(CHAIN), "the return comment is not surfaced on the chain");
});

test("a returned step still blocks everything after it", () => {
  // The unlock rule requires earlier steps to be SIGNED. A returned step that
  // let later ones proceed would be a rejection in name only.
  const chains = readFileSync(join(SRC, "lib", "signoff", "chains.ts"), "utf8");
  assert.ok(
    /every\(\(s\) => s\.status === "SIGNED"\)/.test(chains),
    "isStepUnlocked no longer requires earlier steps to be signed",
  );
});
