import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessContractor,
  assessPerson,
  blockReason,
  summariseRegister,
  REASON_TEXT,
} from "@/lib/hse/contractors";

const TODAY = "2026-08-08";
const ok = { status: "ACTIVE", insuranceExpiryDate: "2027-01-01", inductionValidUntil: "2027-01-01" };

test("a company with current insurance and induction may work", () => {
  const e = assessContractor(ok, TODAY);
  assert.equal(e.eligible, true);
  assert.deepEqual(e.reasons, []);
});

// The three things that silently lapse, nobody gets an email from their
// insurer's expiry date, which is why this belongs in the permit system.
test("expired insurance blocks the contractor", () => {
  const e = assessContractor({ ...ok, insuranceExpiryDate: "2026-08-07" }, TODAY);
  assert.equal(e.eligible, false);
  assert.deepEqual(e.reasons, ["INSURANCE_EXPIRED"]);
});

test("expired induction blocks the contractor", () => {
  const e = assessContractor({ ...ok, inductionValidUntil: "2026-01-01" }, TODAY);
  assert.equal(e.eligible, false);
  assert.deepEqual(e.reasons, ["INDUCTION_EXPIRED"]);
});

test("suspension blocks regardless of paperwork being in order", () => {
  const e = assessContractor({ ...ok, status: "SUSPENDED" }, TODAY);
  assert.equal(e.eligible, false);
  assert.deepEqual(e.reasons, ["SUSPENDED"]);
});

// A blank field is not a pass. "We never checked" and "we checked and it is
// valid" must not look the same to whoever is issuing the permit.
test("a missing date blocks rather than being treated as valid", () => {
  const noIns = assessContractor({ ...ok, insuranceExpiryDate: null }, TODAY);
  assert.equal(noIns.eligible, false);
  assert.deepEqual(noIns.reasons, ["INSURANCE_MISSING"]);

  const noInd = assessContractor({ ...ok, inductionValidUntil: undefined }, TODAY);
  assert.equal(noInd.eligible, false);
  assert.deepEqual(noInd.reasons, ["INDUCTION_MISSING"]);

  const neither = assessContractor({ status: "ACTIVE" }, TODAY);
  assert.equal(neither.reasons.length, 2, "both gaps are reported, not just the first");
});

test("every disqualifying reason is listed, so fixing one does not look like a pass", () => {
  const e = assessContractor(
    { status: "SUSPENDED", insuranceExpiryDate: "2020-01-01", inductionValidUntil: "2020-01-01" },
    TODAY,
  );
  assert.equal(e.reasons.length, 3);
  assert.equal(e.messages.length, 3);
});

test("expiring inside a month warns but does not block", () => {
  const e = assessContractor({ ...ok, insuranceExpiryDate: "2026-08-20" }, TODAY);
  assert.equal(e.eligible, true, "still insured today");
  assert.equal(e.expiringSoon.length, 1);
  assert.match(e.expiringSoon[0], /12 day/);
});

test("expiry today is still valid; expiry yesterday is not", () => {
  assert.equal(assessContractor({ ...ok, insuranceExpiryDate: TODAY }, TODAY).eligible, true);
  assert.equal(assessContractor({ ...ok, insuranceExpiryDate: "2026-08-07" }, TODAY).eligible, false);
});

test("malformed dates block rather than silently passing", () => {
  const e = assessContractor({ ...ok, insuranceExpiryDate: "soon" }, TODAY);
  assert.equal(e.eligible, false);
  assert.deepEqual(e.reasons, ["INSURANCE_MISSING"]);
});

test("every reason code has readable text", () => {
  for (const v of Object.values(REASON_TEXT)) assert.ok(v.length > 0);
});

// A new hire sent to site by an otherwise compliant contractor.
test("an individual's induction is checked separately from their company's", () => {
  assert.equal(assessPerson({ inductionValidUntil: "2027-01-01" }, TODAY).eligible, true);

  const lapsed = assessPerson({ inductionValidUntil: "2026-07-01" }, TODAY);
  assert.equal(lapsed.eligible, false);
  assert.match(lapsed.message ?? "", /expired 38 day/);

  const never = assessPerson({}, TODAY);
  assert.equal(never.eligible, false);
  assert.match(never.message ?? "", /No site induction/);
});

test("the refusal names what to fix rather than quoting a clause", () => {
  const e = assessContractor({ ...ok, insuranceExpiryDate: "2020-01-01" }, TODAY);
  const msg = blockReason("Delta Electricals Ltd", e);
  assert.match(msg, /Delta Electricals Ltd/);
  assert.match(msg, /insurance has expired/i);
  assert.match(msg, /before the permit is issued/);
});

test("the register summary counts blocked and expiring separately", () => {
  const s = summariseRegister(
    [
      ok,
      { ...ok, insuranceExpiryDate: "2020-01-01" },      // blocked
      { ...ok, inductionValidUntil: "2026-08-15" },      // eligible, expiring soon
      { status: "SUSPENDED" },                            // blocked
    ],
    TODAY,
  );
  assert.equal(s.total, 4);
  assert.equal(s.eligible, 2);
  assert.equal(s.blocked, 2);
  assert.equal(s.expiringSoon, 1);
});

test("an empty register does not claim everyone is eligible", () => {
  const s = summariseRegister([], TODAY);
  assert.equal(s.total, 0);
  assert.equal(s.eligible, 0);
  assert.equal(s.blocked, 0);
});
