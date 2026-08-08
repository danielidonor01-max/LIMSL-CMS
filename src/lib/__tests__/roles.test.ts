// Regression tests for the canonical role model — the single source of truth
// behind every sign-off gate, sidebar entry and page guard. A change here that
// nobody notices is an authorisation hole.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  ROLE_ALLOWED_PATHS,
  ROLE_BADGE,
  ROLE_DEPARTMENT,
  ROLE_LABELS,
  ROLE_RANK,
  SETTINGS_WRITE_ROLES,
  canAccessPath,
  canManageUsers,
  canSignStep,
  isSuperAdmin,
} from "@/lib/roles";
import { CHAINS } from "@/lib/signoff/chains";

// ── canSignStep ──────────────────────────────────────────────────────────────

test("a role signs its own step", () => {
  for (const role of ROLES) {
    assert.equal(canSignStep(role, role), true, `${role} cannot sign its own step`);
  }
});

test("Super Admin may sign or override any step", () => {
  for (const role of ROLES) {
    assert.equal(canSignStep("SUPER_ADMIN", role), true, `SUPER_ADMIN blocked on a ${role} step`);
  }
});

test("a strictly more senior role may sign a subordinate step", () => {
  assert.equal(canSignStep("FOREMAN", "TECHNICIAN"), true);
  assert.equal(canSignStep("MAINTENANCE_MANAGER", "FOREMAN"), true);
  assert.equal(canSignStep("FACTORY_MANAGER", "MAINTENANCE_MANAGER"), true);
  assert.equal(canSignStep("COO", "TECHNICIAN"), true);
  // Seniority is rank-based by design, so the management chain also covers the
  // QA/QC and HSE steps.
  assert.equal(canSignStep("MAINTENANCE_MANAGER", "QA_QC"), true);
  assert.equal(canSignStep("COO", "HSE"), true);
});

test("a junior role may never sign a senior step", () => {
  assert.equal(canSignStep("TECHNICIAN", "FOREMAN"), false);
  assert.equal(canSignStep("FOREMAN", "MAINTENANCE_MANAGER"), false);
  assert.equal(canSignStep("MAINTENANCE_MANAGER", "FACTORY_MANAGER"), false);
  assert.equal(canSignStep("FACTORY_MANAGER", "COO"), false);
  assert.equal(canSignStep("VIEWER", "TECHNICIAN"), false);
});

test("peers in different departments cannot sign for each other", () => {
  // QA/QC and HSE share a rank, so neither can cover the other's step — the
  // records check and the safety sign-off stay separate signatures.
  assert.equal(canSignStep("QA_QC", "HSE"), false);
  assert.equal(canSignStep("HSE", "QA_QC"), false);
});

test("an unrelated or absent signer is denied", () => {
  assert.equal(canSignStep(null, "FOREMAN"), false);
  assert.equal(canSignStep(undefined, "FOREMAN"), false);
  assert.equal(canSignStep("", "FOREMAN"), false);
  assert.equal(canSignStep("NOT_A_ROLE", "FOREMAN"), false);
  assert.equal(canSignStep("VIEWER", "FOREMAN"), false);
});

test("an unrecognised role on either side fails CLOSED", () => {
  // A typo in a chain definition must never become a step almost anyone
  // outranks — a compliance gate denies what it cannot recognise.
  assert.equal(canSignStep("TECHNICIAN", "TYPO_ROLE"), false);
  assert.equal(canSignStep("QA_QC", ""), false);
  assert.equal(canSignStep("VIEWER", "TYPO_ROLE"), false);
  assert.equal(canSignStep("NOT_A_ROLE", "FOREMAN"), false);
  // Super Admin remains the deliberate override, even on an unknown step.
  assert.equal(canSignStep("SUPER_ADMIN", "TYPO_ROLE"), true);
  // An exact match still signs, ranked or not.
  assert.equal(canSignStep("TYPO_ROLE", "TYPO_ROLE"), true);
});

test("every declared chain step is signable by its own role and by Super Admin", () => {
  for (const [entityType, chain] of Object.entries(CHAINS)) {
    for (const s of chain) {
      assert.equal(canSignStep(s.role, s.role), true, `${entityType}: ${s.role} cannot sign its own step`);
      assert.equal(canSignStep("SUPER_ADMIN", s.role), true, `${entityType}: SUPER_ADMIN blocked on ${s.role}`);
      assert.equal(canSignStep("VIEWER", s.role), false, `${entityType}: VIEWER could sign the ${s.role} step`);
    }
  }
});

test("a technician cannot sign any approval step above their own", () => {
  for (const [entityType, chain] of Object.entries(CHAINS)) {
    for (const s of chain.filter((x) => x.role !== "TECHNICIAN")) {
      assert.equal(canSignStep("TECHNICIAN", s.role), false, `${entityType}: TECHNICIAN could sign the ${s.role} step`);
    }
  }
});

// ── canAccessPath ────────────────────────────────────────────────────────────

test("/settings is restricted to the settings-write roles", () => {
  for (const role of ROLES) {
    const expected = SETTINGS_WRITE_ROLES.includes(role);
    assert.equal(canAccessPath(role, "/settings"), expected, `${role} on /settings`);
    assert.equal(canAccessPath(role, "/settings/users"), expected, `${role} on /settings/users`);
    assert.equal(canAccessPath(role, "/settings/notifications"), expected, `${role} on /settings/notifications`);
  }
  assert.deepEqual(SETTINGS_WRITE_ROLES, ["SUPER_ADMIN"]);
});

test("no scoped role can reach administration even though it has full module access elsewhere", () => {
  assert.equal(canAccessPath("COO", "/equipment"), true);
  assert.equal(canAccessPath("COO", "/settings"), false);
  assert.equal(canAccessPath("FACTORY_MANAGER", "/settings"), false);
  assert.equal(canAccessPath("MAINTENANCE_MANAGER", "/settings"), false);
});

test("a scoped role reaches its own modules and their sub-routes", () => {
  assert.equal(canAccessPath("QA_QC", "/audit"), true);
  assert.equal(canAccessPath("QA_QC", "/kpi"), true);
  assert.equal(canAccessPath("QA_QC", "/procedure/rev-3"), true);
  assert.equal(canAccessPath("HSE", "/permits"), true);
  assert.equal(canAccessPath("HSE", "/wms/abc123"), true);
  assert.equal(canAccessPath("VIEWER", "/equipment/LEE-PE-0012"), true);
});

test("a scoped role is denied modules outside its department", () => {
  assert.equal(canAccessPath("QA_QC", "/permits"), false);
  assert.equal(canAccessPath("QA_QC", "/wms"), false);
  assert.equal(canAccessPath("QA_QC", "/calibration"), false);
  assert.equal(canAccessPath("HSE", "/kpi"), false);
  assert.equal(canAccessPath("HSE", "/documents"), false);
  assert.equal(canAccessPath("HSE", "/reports"), false);
  assert.equal(canAccessPath("VIEWER", "/work-orders"), false);
  assert.equal(canAccessPath("VIEWER", "/corrective"), false);
});

test("prefix matching is segment-aware, not a naive startsWith", () => {
  assert.equal(canAccessPath("VIEWER", "/equipmentx"), false);
  assert.equal(canAccessPath("VIEWER", "/reports-archive"), false);
  assert.equal(canAccessPath("QA_QC", "/auditor"), false);
  assert.equal(canAccessPath("VIEWER", "/equipment/"), true);
});

test("the dashboard root is an exact match, not a prefix that opens everything", () => {
  assert.equal(canAccessPath("VIEWER", "/"), true);
  assert.equal(canAccessPath("VIEWER", "/anything-else"), false);
});

test("universal paths are open to every role", () => {
  for (const role of ROLES) {
    for (const path of ["/login", "/change-password", "/notifications", "/account"]) {
      assert.equal(canAccessPath(role, path), true, `${role} blocked from ${path}`);
    }
  }
});

test("universal paths match exactly — a sub-route falls back to the role's scope", () => {
  // No sub-routes exist under these today; if one is added, scoped roles will
  // need it added to their allow-list or to UNIVERSAL_PATHS.
  assert.equal(canAccessPath("VIEWER", "/notifications/abc"), false);
  assert.equal(canAccessPath("SUPER_ADMIN", "/notifications/abc"), true);
});

test("an unlisted role has full access, and an unauthenticated caller is left to the proxy", () => {
  for (const path of ["/", "/work-orders", "/kpi", "/an/unknown/page"]) {
    assert.equal(canAccessPath("MAINTENANCE_MANAGER", path), true, `MAINTENANCE_MANAGER on ${path}`);
    assert.equal(canAccessPath(null, path), true, `unauthenticated on ${path}`);
    assert.equal(canAccessPath(undefined, path), true);
  }
  // Even /settings — the middleware, not this helper, stops the anonymous case.
  assert.equal(canAccessPath(null, "/settings"), true);
});

test("every path a scoped role is granted is actually reachable", () => {
  for (const [role, paths] of Object.entries(ROLE_ALLOWED_PATHS)) {
    for (const p of paths) {
      assert.equal(canAccessPath(role, p), true, `${role} cannot reach its own allowed path ${p}`);
      if (p !== "/") {
        assert.equal(canAccessPath(role, `${p}/detail-1`), true, `${role} cannot reach ${p}/detail-1`);
      }
    }
    assert.equal(canAccessPath(role, "/settings"), false, `${role} could reach administration`);
  }
});

// ── Table integrity ──────────────────────────────────────────────────────────

test("every canonical role has a label, department, rank and badge", () => {
  for (const role of ROLES) {
    assert.ok(ROLE_LABELS[role]?.trim(), `${role} has no label`);
    assert.ok(ROLE_DEPARTMENT[role]?.trim(), `${role} has no department`);
    assert.equal(typeof ROLE_RANK[role], "number", `${role} has no rank`);
    assert.ok(ROLE_BADGE[role]?.trim(), `${role} has no badge style`);
  }
  assert.equal(new Set(ROLES).size, ROLES.length, "duplicate role in ROLES");
});

test("the rank table matches the documented approval chain order", () => {
  const chain = ["VIEWER", "TECHNICIAN", "FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER", "COO"];
  for (let i = 1; i < chain.length; i++) {
    assert.ok(ROLE_RANK[chain[i]] > ROLE_RANK[chain[i - 1]], `${chain[i]} does not outrank ${chain[i - 1]}`);
  }
  assert.equal(ROLE_RANK.QA_QC, ROLE_RANK.HSE);
  assert.ok(ROLE_RANK.SUPER_ADMIN > ROLE_RANK.COO);
});

test("every scoped role in the path table is a canonical role", () => {
  for (const role of Object.keys(ROLE_ALLOWED_PATHS)) {
    assert.ok((ROLES as readonly string[]).includes(role), `${role} is not a canonical role`);
  }
});

// A new module reachable from the sidebar but absent from a scoped role's path
// list renders "Access restricted" — the nav and the guard read the same table,
// so the failure stays silent until someone with that role clicks it.
test("the spares register is reachable by the roles that maintain machinery", () => {
  for (const role of ["SUPER_ADMIN", "COO", "FACTORY_MANAGER", "MAINTENANCE_MANAGER", "FOREMAN", "TECHNICIAN", "QA_QC"]) {
    assert.equal(canAccessPath(role, "/spares"), true, `${role} cannot reach /spares`);
  }
  // Read-only and safety-scoped roles keep their existing scope.
  assert.equal(canAccessPath("VIEWER", "/spares"), false);
  assert.equal(canAccessPath("HSE", "/spares"), false);
});

test("user administration is the Super Admin's alone", () => {
  for (const role of ROLES) {
    assert.equal(canManageUsers(role), role === "SUPER_ADMIN", `${role} user management`);
    assert.equal(isSuperAdmin(role), role === "SUPER_ADMIN");
  }
  assert.equal(canManageUsers(null), false);
  assert.equal(isSuperAdmin(undefined), false);
});
