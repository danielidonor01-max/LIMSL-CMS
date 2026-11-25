// src/lib/__tests__/who-can-do-what.test.ts
// The go-live access rules (checklist section 2, items 7 to 12). Each of these
// failed open before: nothing looked wrong, a record simply changed through
// somebody who should not have been able to change it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { workOrderMoveError } from "@/lib/maintenance/work-order-status";
import { fieldChanges, comparable } from "@/lib/audit-diff";
import { cmLockedChanges } from "@/lib/maintenance/cm-lock";
import { leavesNoSuperAdmin } from "@/lib/super-admin-guard";
import { GUESS_LIMIT, isLockedOut, windowStart } from "@/lib/auth/guess-limit";

const read = (p: string) => readFileSync(p, "utf8");

// ── 7. Work order status ─────────────────────────────────────────────────────
test("only the approval releases a pending work order", () => {
  assert.ok(workOrderMoveError("PENDING_APPROVAL", "OPEN"));
  assert.ok(workOrderMoveError("PENDING_APPROVAL", "IN_PROGRESS"));
  assert.ok(workOrderMoveError("PENDING_APPROVAL", "COMPLETED"));
  assert.equal(workOrderMoveError("PENDING_APPROVAL", "CANCELLED"), null);
});

test("a rejected work order is resubmitted or cancelled, nothing else", () => {
  assert.ok(workOrderMoveError("REJECTED", "OPEN"));
  assert.ok(workOrderMoveError("REJECTED", "PENDING_APPROVAL"));
  assert.equal(workOrderMoveError("REJECTED", "CANCELLED"), null);
});

test("a finished work order is never reopened", () => {
  for (const to of ["OPEN", "IN_PROGRESS", "PENDING_APPROVAL"]) {
    assert.ok(workOrderMoveError("CANCELLED", to), `CANCELLED -> ${to}`);
    assert.ok(workOrderMoveError("COMPLETED", to), `COMPLETED -> ${to}`);
  }
});

test("the everyday moves still work, and unknown statuses are refused", () => {
  assert.equal(workOrderMoveError("OPEN", "IN_PROGRESS"), null);
  assert.equal(workOrderMoveError("IN_PROGRESS", "COMPLETED"), null);
  assert.equal(workOrderMoveError("OPEN", "CANCELLED"), null);
  assert.equal(workOrderMoveError("IN_PROGRESS", "IN_PROGRESS"), null);
  assert.ok(workOrderMoveError("OPEN", "APPROVED"));
});

test("the update route applies the rule before it writes", () => {
  const route = read("src/app/api/work-orders/[id]/route.ts");
  const check = route.indexOf("workOrderMoveError(current.status");
  assert.ok(check > 0, "the route no longer checks the move");
  assert.ok(check < route.indexOf("db.update(workOrders)"), "the move is checked after the write");
});

// ── 8. Role and active status re-read ────────────────────────────────────────
test("every request re-reads the account and ends a deactivated session", () => {
  const src = read("src/auth.ts");
  assert.match(src, /async jwt\(params\)/);
  assert.match(src, /if \(!u \|\| u\.isActive === false\) return null;/);
  assert.match(src, /token\.role = u\.role;/);
  assert.match(read("src/auth.config.ts"), /maxAge: 12 \* 60 \* 60/);
});

// ── 9. Signatures are voided, never deleted ──────────────────────────────────
test("the old WMS and JHA edit routes are gone", () => {
  for (const p of ["src/app/api/wms/[id]/route.ts", "src/app/api/jha/[id]/route.ts"]) {
    assert.ok(existsSync(p));
    assert.doesNotMatch(read(p), /export async function (PATCH|PUT|DELETE)/, `${p} can edit a signed document again`);
  }
});

test("only a rejected work order can be resubmitted", () => {
  const src = read("src/app/api/work-orders/[id]/resubmit/route.ts");
  assert.match(src, /if \(wo\.status !== "REJECTED"\)/);
  assert.doesNotMatch(src, /"PENDING_APPROVAL" &&|!== "PENDING_APPROVAL"/);
});

test("resetting a chain voids the signatures given instead of deleting them", () => {
  const src = read("src/lib/signoff/service.ts");
  const reset = src.slice(src.indexOf("export async function resetSignoffChain"));
  assert.match(reset, /voidSignoffChain\(/);
  const voidFn = src.slice(src.indexOf("export async function voidSignoffChain"), src.indexOf("export async function resetSignoffChain"));
  // The only delete is of steps nobody signed.
  assert.match(voidFn, /\.delete\(signoffs\)[\s\S]*eq\(signoffs\.status, "PENDING"\)/);
  assert.match(voidFn, /status !== "PENDING"/);
});

// ── 10. Breakdown lock and audit ─────────────────────────────────────────────
test("an unchanged form is not a change", () => {
  const stored = { rcaAnalysis: JSON.stringify({ why1: "bearing", why2: null }), downStartAt: "2026-11-14T08:00:00.000Z", faultType: null };
  const sent = { rcaAnalysis: JSON.stringify({ why2: "", why1: "bearing" }), downStartAt: "2026-11-14T08:00", faultType: "" };
  assert.deepEqual(fieldChanges(stored, sent), {});
  assert.equal(comparable({}), "");
});

test("after the first signature a set value is locked and a blank can be filled", () => {
  const changes = fieldChanges(
    { verifiedRootCause: "Worn bearing", downEndAt: null, correctiveActions: "[]" },
    { verifiedRootCause: "Operator error", downEndAt: "2026-11-15T10:00", correctiveActions: '[{"action":"x"}]' },
  );
  assert.deepEqual(cmLockedChanges(changes, { signed: false, closed: false }), []);
  assert.deepEqual(cmLockedChanges(changes, { signed: true, closed: false }), ["verifiedRootCause"]);
});

test("a closed breakdown changes in nothing but its follow-up actions", () => {
  const changes = fieldChanges(
    { downEndAt: null, correctiveActions: "[]", preventiveActions: null },
    { downEndAt: "2026-11-15T10:00", correctiveActions: '[{"action":"x"}]', preventiveActions: '[{"action":"y"}]' },
  );
  assert.deepEqual(cmLockedChanges(changes, { signed: true, closed: true }), ["downEndAt"]);
});

test("breakdown and equipment edits write their before and after to the audit log", () => {
  for (const p of ["src/app/api/corrective/[id]/route.ts", "src/app/api/equipment/[assetId]/route.ts"]) {
    const src = read(p);
    assert.match(src, /fieldChanges\(/, `${p} no longer works out what changed`);
    assert.match(src, /insert\(auditLog\)[\s\S]*changes: JSON\.stringify\(changes\)/, `${p} no longer audits the change`);
  }
  assert.match(read("src/app/api/corrective/[id]/route.ts"), /cmLockedChanges\(changes/);
});

// ── 11. The last Super Admin ─────────────────────────────────────────────────
test("the last active Super Admin cannot be deactivated or demoted", () => {
  const admin = { role: "SUPER_ADMIN", isActive: true };
  assert.equal(leavesNoSuperAdmin(admin, { isActive: false }, 0), true);
  assert.equal(leavesNoSuperAdmin(admin, { role: "COO" }, 0), true);
  assert.equal(leavesNoSuperAdmin(admin, { isActive: false }, 1), false);
  assert.equal(leavesNoSuperAdmin(admin, { role: "SUPER_ADMIN", isActive: true }, 0), false);
  assert.equal(leavesNoSuperAdmin({ role: "FOREMAN", isActive: true }, { isActive: false }, 0), false);
  assert.equal(leavesNoSuperAdmin({ role: "ADMIN", isActive: null }, { role: "VIEWER" }, 0), true);
});

// ── 12. Guess limits ─────────────────────────────────────────────────────────
test("five wrong guesses in fifteen minutes lock", () => {
  assert.equal(isLockedOut(GUESS_LIMIT - 1), false);
  assert.equal(isLockedOut(GUESS_LIMIT), true);
  assert.equal(windowStart(new Date("2026-11-25T10:15:30.500Z")), "2026-11-25T10:00:30Z");
});

test("every place a password or PIN is checked counts towards the limit", () => {
  const auth = read("src/auth.ts");
  assert.ok(auth.indexOf("isLockedOut(failures)") < auth.indexOf("verifyPassword(password"), "the lock is checked after the password");
  assert.match(auth, /recordFailure\(user, "LOGIN_FAILED"/);
  assert.match(read("src/app/api/users/change-password/route.ts"), /recordFailure\(user, "LOGIN_FAILED"/);
  const sign = read("src/app/api/signoffs/[id]/route.ts");
  assert.match(sign, /recordFailure\(signer, "PIN_FAILED"/);
  assert.ok(sign.indexOf("isLockedOut(pinFailures)") < sign.indexOf("!verifyPassword(String(body.signingPin"));
  assert.match(read("src/app/api/account/signing-pin/route.ts"), /recordFailure\(row, "PIN_FAILED"/);
});
