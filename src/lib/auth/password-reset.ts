// src/lib/auth/password-reset.ts
// Password reset, written so that the obvious mistakes are impossible rather
// than merely avoided.
//
//   • The token is random, 32 bytes, from a CSPRNG — never derived from the
//     user id, the email, or the time.
//   • Only its HASH is stored. A reset table holding usable tokens hands out
//     accounts to anyone who can read the database.
//   • It expires, and it is single-use — consumed the moment it succeeds.
//   • Requesting a reset for an unknown address answers exactly as it does for
//     a known one. Anything else turns the form into a "does this person work
//     here" oracle, which for a company directory is worth having.
//   • Issuing a new token invalidates the outstanding ones, so a forwarded old
//     email cannot be used after the real owner has asked again.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const RESET_TOKEN_BYTES = 32;
export const RESET_TTL_MINUTES = 60;

export function generateResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(RESET_TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

// SHA-256 is right here and bcrypt/scrypt would be wrong: the input is 32 bytes
// of CSPRNG output, so there is no dictionary to attack and nothing to slow
// down. The hash exists to stop a database reader replaying the token.
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function resetExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + RESET_TTL_MINUTES * 60_000).toISOString();
}

// Constant-time compare, so the failure path cannot be walked character by
// character with a stopwatch.
export function tokenMatches(candidateHash: string, storedHash: string): boolean {
  const a = Buffer.from(candidateHash, "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export type ResetRow = { expiresAt: string; usedAt: string | null };

export function resetIsUsable(
  row: ResetRow | undefined | null,
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (!row) return { ok: false, reason: "This reset link is not valid. Request a new one." };
  if (row.usedAt) {
    return { ok: false, reason: "This reset link has already been used. Request a new one." };
  }
  const expires = Date.parse(row.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) {
    return { ok: false, reason: `This reset link has expired — they last ${RESET_TTL_MINUTES} minutes. Request a new one.` };
  }
  return { ok: true };
}

// Password rules, stated once so the API and the form cannot disagree about
// what is acceptable.
export const MIN_PASSWORD_LENGTH = 10;

export function validateNewPassword(password: unknown, email?: string): { ok: true } | { ok: false; error: string } {
  const p = typeof password === "string" ? password : "";
  if (p.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (/^\s|\s$/.test(p)) {
    return { ok: false, error: "The password cannot start or end with a space." };
  }
  // The two passwords every deployment of this app will otherwise contain.
  if (/^limsl\d*$/i.test(p) || /^password/i.test(p)) {
    return { ok: false, error: "That password is too easy to guess. Choose something else." };
  }
  if (email) {
    const local = email.split("@")[0]?.toLowerCase();
    if (local && local.length > 2 && p.toLowerCase().includes(local)) {
      return { ok: false, error: "Do not use your email address in your password." };
    }
  }
  return { ok: true };
}
