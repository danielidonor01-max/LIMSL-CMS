// src/lib/__tests__/schedule-roles.test.ts
// Who may assign work and renew a permit, as LIMSL decided in November 2026.
// Both lists are short on purpose; widening either is a decision, not a fix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WORK_ASSIGN_ROLES, PERMIT_RENEW_ROLES } from "@/lib/roles";

test("QA/QC, HSE, the technician and the COO do not assign work or raise batches", () => {
  for (const role of ["QA_QC", "HSE", "TECHNICIAN", "COO", "VIEWER"]) {
    assert.ok(!WORK_ASSIGN_ROLES.includes(role), `${role} must not assign`);
  }
  for (const role of ["FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER"]) {
    assert.ok(WORK_ASSIGN_ROLES.includes(role), `${role} assigns`);
  }
});

test("only the Maintenance Manager renews a permit for a further day", () => {
  assert.deepEqual(PERMIT_RENEW_ROLES, ["MAINTENANCE_MANAGER"]);
});
