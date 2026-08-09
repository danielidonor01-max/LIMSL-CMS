import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateResetToken,
  hashResetToken,
  resetExpiry,
  resetIsUsable,
  tokenMatches,
  validateNewPassword,
  RESET_TTL_MINUTES,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/password-reset";

// A reset table holding usable tokens hands out accounts to anyone who can read
// the database, a dump, a stale backup, a console session.
test("the stored value is a hash, never the token itself", () => {
  const { token, tokenHash } = generateResetToken();
  assert.notEqual(token, tokenHash);
  assert.ok(!tokenHash.includes(token));
  assert.match(tokenHash, /^[0-9a-f]{64}$/, "sha-256 hex");
  assert.equal(hashResetToken(token), tokenHash, "the same token must hash to the stored value");
});

test("tokens are long and unguessable, and never repeat", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const { token } = generateResetToken();
    assert.ok(token.length >= 40, "32 bytes of entropy, base64url");
    assert.ok(!seen.has(token), "a repeated token would be a catastrophic RNG failure");
    seen.add(token);
  }
});

test("a wrong token does not match a stored hash", () => {
  const a = generateResetToken();
  const b = generateResetToken();
  assert.equal(tokenMatches(hashResetToken(a.token), a.tokenHash), true);
  assert.equal(tokenMatches(hashResetToken(b.token), a.tokenHash), false);
});

test("comparison tolerates junk without throwing", () => {
  const { tokenHash } = generateResetToken();
  assert.equal(tokenMatches("", tokenHash), false);
  assert.equal(tokenMatches("zz", tokenHash), false);
  assert.equal(tokenMatches(tokenHash, ""), false);
});

// ── Usability ────────────────────────────────────────────────────────────────
test("a fresh, unused link works", () => {
  assert.deepEqual(resetIsUsable({ expiresAt: resetExpiry(), usedAt: null }), { ok: true });
});

test("an expired link is refused and says why", () => {
  const past = new Date(Date.now() - 60_000).toISOString();
  const r = resetIsUsable({ expiresAt: past, usedAt: null });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", new RegExp(String(RESET_TTL_MINUTES)));
});

// Single use, so a link sitting in an inbox or a forwarded thread cannot be
// replayed after the owner has already used it.
test("a used link cannot be used again", () => {
  const r = resetIsUsable({ expiresAt: resetExpiry(), usedAt: new Date().toISOString() });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.reason : "", /already been used/i);
});

test("an unknown token is refused rather than treated as absent-but-fine", () => {
  assert.equal(resetIsUsable(undefined).ok, false);
  assert.equal(resetIsUsable(null).ok, false);
});

test("a malformed expiry is treated as expired, not as valid", () => {
  assert.equal(resetIsUsable({ expiresAt: "not a date", usedAt: null }).ok, false);
});

test("the window is an hour", () => {
  const ms = Date.parse(resetExpiry(new Date("2026-08-09T10:00:00Z"))) - Date.parse("2026-08-09T10:00:00Z");
  assert.equal(ms, RESET_TTL_MINUTES * 60_000);
});

// ── Password rules ───────────────────────────────────────────────────────────
test("a decent password is accepted", () => {
  assert.equal(validateNewPassword("correct-horse-battery").ok, true);
});

test("short passwords are refused", () => {
  assert.equal(validateNewPassword("short").ok, false);
  assert.equal(validateNewPassword("x".repeat(MIN_PASSWORD_LENGTH - 1)).ok, false);
  assert.equal(validateNewPassword("x".repeat(MIN_PASSWORD_LENGTH)).ok, true);
});

// The two passwords this deployment would otherwise be full of.
test("the seed password and 'password...' are refused by name", () => {
  assert.equal(validateNewPassword("limsl2026").ok, false);
  assert.equal(validateNewPassword("LIMSL2026").ok, false);
  assert.equal(validateNewPassword("password123").ok, false);
});

test("a password containing the email local part is refused", () => {
  assert.equal(validateNewPassword("didonor-1234", "didonor@leemachinery.net").ok, false);
  assert.equal(validateNewPassword("unrelated-phrase", "didonor@leemachinery.net").ok, true);
});

test("leading or trailing spaces are refused, they survive paste and confuse later sign-ins", () => {
  assert.equal(validateNewPassword(" leadingspace").ok, false);
  assert.equal(validateNewPassword("trailingspace ").ok, false);
});

test("non-string input is refused rather than coerced", () => {
  for (const v of [null, undefined, 12345678901, {}]) {
    assert.equal(validateNewPassword(v).ok, false, `${String(v)} is not a password`);
  }
});
