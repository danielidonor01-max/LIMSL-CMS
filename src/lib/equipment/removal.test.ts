// src/lib/equipment/removal.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canRetire,
  canPurge,
  describeReferences,
  isRemovalReason,
  removalReasonLabel,
  REMOVAL_REASONS,
} from "@/lib/equipment/removal";

const purge = (over: Partial<Parameters<typeof canPurge>[0]> = {}) =>
  canPurge({
    isSuperAdmin: true,
    passwordOk: true,
    passwordConfigured: true,
    references: [],
    ...over,
  });

// ── Retiring ─────────────────────────────────────────────────────────────────

test("an asset is retired with a reason", () => {
  assert.deepEqual(canRetire({ reason: "SOLD", alreadyRemoved: false }), { ok: true });
});

test("a removal with no reason is refused", () => {
  // The reason is the whole point of the record. Without it the register just
  // says a machine stopped being there.
  assert.equal(canRetire({ reason: undefined, alreadyRemoved: false }).ok, false);
  assert.equal(canRetire({ reason: "", alreadyRemoved: false }).ok, false);
  assert.equal(canRetire({ reason: "BECAUSE", alreadyRemoved: false }).ok, false);
});

test('"other" has to say what other means', () => {
  // A reason of "other" with nothing beside it tells a future reader nothing,
  // and this is a record somebody reads years later asking where a machine went.
  assert.equal(canRetire({ reason: "OTHER", alreadyRemoved: false }).ok, false);
  assert.equal(canRetire({ reason: "OTHER", note: "   ", alreadyRemoved: false }).ok, false);
  assert.equal(
    canRetire({ reason: "OTHER", note: "Returned to the leasing company.", alreadyRemoved: false }).ok,
    true,
  );
});

test("the other reasons do not demand a note", () => {
  // "Sold" is self-explanatory. Demanding prose for it trains people to type
  // a full stop to get past the form.
  for (const reason of ["DECOMMISSIONED", "SOLD", "DAMAGED", "LOST"]) {
    assert.equal(canRetire({ reason, alreadyRemoved: false }).ok, true, reason);
  }
});

test("an asset already off the register is not removed twice", () => {
  const d = canRetire({ reason: "SOLD", alreadyRemoved: true });
  assert.equal(d.ok, false);
  assert.match(d.ok === false ? d.error : "", /already off the register/i);
});

// ── Deleting ─────────────────────────────────────────────────────────────────

test("an asset with no history can be deleted", () => {
  // The only legitimate case: a duplicate typed twice, a test row, a tag
  // created by mistake. Nothing is attached, so nothing is lost.
  assert.deepEqual(purge(), { ok: true });
});

test("an asset with any history cannot be deleted, however small", () => {
  // One work order is enough. The record is evidence that work happened, and
  // deleting the asset would orphan it.
  const d = purge({ references: [{ label: "work orders", count: 1 }] });
  assert.equal(d.ok, false);
  assert.match(d.ok === false ? d.error : "", /1 work order\b/);
  assert.match(d.ok === false ? d.error : "", /Remove it from the register instead/);
});

test("the refusal names what is actually holding the asset", () => {
  // A refusal that says "cannot delete" and stops sends somebody hunting. This
  // one says where to look.
  const d = purge({
    references: [
      { label: "work orders", count: 3 },
      { label: "permits", count: 1 },
      { label: "calibration records", count: 2 },
      { label: "incidents", count: 0 },
    ],
  });
  assert.equal(d.ok, false);
  const msg = d.ok === false ? d.error : "";
  assert.match(msg, /3 work orders/);
  assert.match(msg, /1 permit\b/);
  assert.match(msg, /2 calibration records/);
  assert.ok(!msg.includes("incident"), "a table holding nothing should not be listed");
});

test("both the role and the password are required, not either", () => {
  // Two controls, because one of them alone is a single click away from an
  // empty register.
  assert.equal(purge({ isSuperAdmin: false }).ok, false);
  assert.equal(purge({ passwordOk: false }).ok, false);
  assert.equal(purge({ isSuperAdmin: false, passwordOk: false }).ok, false);
});

test("the role is checked before the password", () => {
  // So a technician probing the form cannot use it as an oracle to discover
  // whether a guessed password was right.
  const d = purge({ isSuperAdmin: false, passwordOk: false });
  assert.match(d.ok === false ? d.error : "", /Super Admin/);
});

test("deletion is unavailable rather than open when no password is configured", () => {
  // The failure that matters: an unset environment variable must never read as
  // an empty password that anything matches.
  const d = purge({ passwordConfigured: false, passwordOk: true });
  assert.equal(d.ok, false);
  assert.match(d.ok === false ? d.error : "", /not configured/i);
});

// ── Wording ──────────────────────────────────────────────────────────────────

test("counts of one read as one thing", () => {
  assert.equal(describeReferences([{ label: "permits", count: 1 }]), "1 permit");
  assert.equal(describeReferences([{ label: "work orders", count: 1 }]), "1 work order");
  assert.equal(describeReferences([{ label: "non-conformities", count: 1 }]), "1 non-conformity");
});

test("several are listed worst-first and joined properly", () => {
  assert.equal(
    describeReferences([
      { label: "permits", count: 1 },
      { label: "work orders", count: 5 },
      { label: "incidents", count: 2 },
    ]),
    "5 work orders, 2 incidents and 1 permit",
  );
});

test("nothing held reads as nothing", () => {
  assert.equal(describeReferences([]), "nothing");
  assert.equal(describeReferences([{ label: "permits", count: 0 }]), "nothing");
});

test("every reason carries a label and a hint", () => {
  // The hint is what stops "decommissioned" and "damaged" being picked at
  // random on a form somebody fills in once a year.
  for (const r of REMOVAL_REASONS) {
    assert.ok(r.label.length > 0, `${r.value} has no label`);
    assert.ok(r.hint.length > 0, `${r.value} has no hint`);
    assert.ok(isRemovalReason(r.value));
  }
});

test("an unknown stored reason still renders as something", () => {
  // Rows written before this existed, or by a future version, must not render
  // as "undefined" on a compliance record.
  assert.equal(removalReasonLabel(null), "Removed");
  assert.equal(removalReasonLabel("WHATEVER"), "Removed");
  assert.equal(removalReasonLabel("SOLD"), "Sold or transferred");
});
