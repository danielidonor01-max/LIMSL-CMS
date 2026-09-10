// src/lib/__tests__/signing-pin.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePin, needsPinSetup, PIN_LENGTH } from "@/lib/signing-pin";
import { hashPassword, verifyPassword } from "@/lib/password";

test("a PIN is exactly six digits", () => {
  assert.equal(validatePin("284917").ok, true);
  for (const bad of ["", "1234", "12345", "1234567", "28491a", "28 491", null, undefined, 284917]) {
    assert.equal(validatePin(bad).ok, false, `${String(bad)} should be refused`);
  }
});

test("the PINs a colleague would guess first are refused", () => {
  // Each of these rules out something somebody standing behind you would try
  // before anything else.
  for (const bad of ["111111", "000000", "123456", "654321", "121212", "123123", "112112"]) {
    const r = validatePin(bad);
    assert.equal(r.ok, false, `${bad} should be refused`);
    assert.ok(!r.ok && r.error.length > 20, `${bad} was refused without saying why`);
  }
});

test("a PIN beginning with zero survives, and a number never counts as one", () => {
  // 042917 sent as a JSON number arrives as 42917. Accepting numbers would have
  // refused exactly one person's PIN, the one who chose a leading zero, and
  // worked for everybody else.
  assert.equal(validatePin("042917").ok, true);
  assert.equal(validatePin(42917).ok, false);
  assert.equal(validatePin(284917).ok, false);
});

test("an ordinary PIN with a repeated digit is fine", () => {
  // The rule is about patterns, not about repetition. Refusing every PIN with
  // a repeated digit would push people towards writing it on the machine.
  for (const good of ["284917", "100200", "778213", "902055"]) {
    assert.equal(validatePin(good).ok, true, `${good} should be accepted`);
  }
});

test("a refusal always explains itself", () => {
  // It is entered on a workshop tablet by somebody mid-job. "Invalid" sends
  // them to find a supervisor.
  for (const bad of ["12345", "111111", "123456"]) {
    const r = validatePin(bad);
    assert.equal(r.ok, false);
    assert.ok(!r.ok && /\.$/.test(r.error), `"${bad}" refusal is not a sentence`);
  }
});

test("nobody is locked out on the day this ships", () => {
  // Every existing user has no PIN. Requiring one outright would stop every
  // signature in the business at once, so this flags setup rather than refusal.
  assert.equal(needsPinSetup(null), true);
  assert.equal(needsPinSetup(undefined), true);
  assert.equal(needsPinSetup(""), true);
  assert.equal(needsPinSetup("salt:hash"), false);
});

test("the PIN is stored hashed, and never recoverable", () => {
  // Reuses the same scrypt helper as passwords, so there is one hashing
  // implementation to get right rather than two.
  const stored = hashPassword("284917");
  assert.notEqual(stored, "284917");
  assert.ok(!stored.includes("284917"), "the PIN is recoverable from what is stored");
  assert.equal(verifyPassword("284917", stored), true);
  assert.equal(verifyPassword("284918", stored), false);
});

test("two users choosing the same PIN do not get the same hash", () => {
  // A shared salt would let anybody with database read access group everyone
  // who picked the same PIN, which on six digits is a short list.
  assert.notEqual(hashPassword("284917"), hashPassword("284917"));
});

test("the length is stated once and read everywhere", () => {
  assert.equal(PIN_LENGTH, 6);
  assert.equal(validatePin("2".padStart(PIN_LENGTH, "8")).ok, true);
});
