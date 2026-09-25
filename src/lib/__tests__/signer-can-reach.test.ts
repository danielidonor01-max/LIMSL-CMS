// src/lib/__tests__/signer-can-reach.test.ts
// Everybody a chain asks to sign can open the page they are sent to sign it on.
//
// Two separate lists decide this and nothing tied them together: chains.ts says
// who signs each document, and ROLE_ALLOWED_PATHS says which pages each role can
// open. When QA/QC were added to the method statement chain they could not open
// /wms, so the sign-off request led them to a page that refused them — and the
// test that proved the chain worked signed it through the API, where page access
// never comes up. This asks the question directly, for every step of every chain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAINS } from "../signoff/chains";
import { entityHref } from "../signoff/inbox";
import { canAccessPath } from "../roles";

test("every signer can open the page their signature is given on", () => {
  const blocked: string[] = [];
  for (const [entityType, steps] of Object.entries(CHAINS)) {
    const path = entityHref(entityType, "sample-id").split("?")[0];
    for (const step of steps) {
      if (!canAccessPath(step.role, path)) {
        blocked.push(`${entityType}: ${step.role} ("${step.roleLabel}") cannot open ${path}`);
      }
    }
  }
  assert.deepEqual(blocked, [], `signers sent to pages they cannot open:\n  ${blocked.join("\n  ")}`);
});

test("every chain has somewhere to be signed", () => {
  // A chain with no page falls back to "/", which is a notification that
  // lands on the dashboard and a signer left looking for the document.
  const homeless = Object.keys(CHAINS).filter((t) => entityHref(t, "x") === "/");
  assert.deepEqual(homeless, [], `chains with no page: ${homeless.join(", ")}`);
});
