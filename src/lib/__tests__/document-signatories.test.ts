// src/lib/__tests__/document-signatories.test.ts
// Who signs a controlled document, as LIMSL set it in November 2026. Each is
// signed in two passes, review then implementation, by the same three people:
//   WMS: originator (Foreman, or a Super Admin) → Maintenance Manager → Factory Manager
//   JHA: HSE Supervisor → the Foreman who originated the WMS → Factory Manager
// The Maintenance Manager's and Factory Manager's steps are theirs alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WMS_CHAIN, JHA_CHAIN, canSignChainStep, isOverrideSignature, passOf } from "@/lib/signoff/chains";

const at = (entityType: string, stepOrder: number, role: string) => ({ entityType, step: { stepOrder, role } });

test("WMS and JHA are signed in two passes of three", () => {
  for (const chain of [WMS_CHAIN, JHA_CHAIN]) {
    assert.equal(chain.length, 6);
    assert.deepEqual(chain.map((s) => s.pass), ["REVIEW", "REVIEW", "REVIEW", "IMPLEMENTATION", "IMPLEMENTATION", "IMPLEMENTATION"]);
    assert.deepEqual(chain.slice(0, 3).map((s) => s.role), chain.slice(3).map((s) => s.role));
  }
  assert.deepEqual(WMS_CHAIN.slice(0, 3).map((s) => s.role), ["FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER"]);
  assert.deepEqual(JHA_CHAIN.slice(0, 3).map((s) => s.role), ["HSE", "FOREMAN", "FACTORY_MANAGER"]);
  assert.equal(passOf("WMS", { stepOrder: 4, role: "FOREMAN" }), "IMPLEMENTATION");
});

test("a Foreman or a Super Admin originates a WMS, and neither is an override", () => {
  const { entityType, step } = at("WMS", 1, "FOREMAN");
  assert.ok(canSignChainStep("FOREMAN", entityType, step));
  assert.ok(canSignChainStep("SUPER_ADMIN", entityType, step));
  assert.ok(!isOverrideSignature("SUPER_ADMIN", entityType, step));
  assert.ok(!canSignChainStep("TECHNICIAN", entityType, step));
});

test("only the Maintenance Manager and the Factory Manager sign their own steps", () => {
  for (const order of [2, 5]) {
    const { entityType, step } = at("WMS", order, "MAINTENANCE_MANAGER");
    assert.ok(canSignChainStep("MAINTENANCE_MANAGER", entityType, step));
    for (const other of ["SUPER_ADMIN", "FACTORY_MANAGER", "COO", "FOREMAN"]) {
      assert.ok(!canSignChainStep(other, entityType, step), `${other} must not sign the MM step`);
    }
  }
  for (const [type, order] of [["WMS", 3], ["WMS", 6], ["JHA", 3], ["JHA", 6]] as const) {
    const { entityType, step } = at(type, order, "FACTORY_MANAGER");
    assert.ok(canSignChainStep("FACTORY_MANAGER", entityType, step));
    assert.ok(!canSignChainStep("SUPER_ADMIN", entityType, step), `Super Admin must not sign the FM step on ${type}`);
    assert.ok(!canSignChainStep("COO", entityType, step), `COO must not sign the FM step on ${type}`);
  }
});

test("the JHA's second signature belongs to the WMS originator", () => {
  assert.equal(JHA_CHAIN[1].signer, "WMS_ORIGINATOR");
  assert.equal(JHA_CHAIN[4].signer, "WMS_ORIGINATOR");
  const { entityType, step } = at("JHA", 1, "HSE");
  assert.ok(canSignChainStep("HSE", entityType, step));
  assert.ok(!canSignChainStep("MAINTENANCE_MANAGER", entityType, step));
});

test("a chain row that no longer matches the definition keeps the general rule", () => {
  // Step 2 of an old WMS chain held the Maintenance Manager too, but a row
  // whose role differs from today's definition is judged by role alone.
  const { entityType, step } = at("WMS", 2, "FACTORY_MANAGER");
  assert.ok(canSignChainStep("SUPER_ADMIN", entityType, step));
});
