// src/lib/password-policy.ts
// Single source of truth for password strength rules. The API enforces it and
// the change-password form calls the same function, so the two can never drift.
//
// Deliberately kept separate from `password.ts`: that module imports node:crypto
// for hashing, which cannot be pulled into a client bundle. This file is pure
// string checks, so a client component can import it safely.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters, including a letter, a number, and a symbol.`;

// Returns an error message, or null when the password satisfies the policy.
export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
  }
  if (!/[A-Za-z]/.test(password)) return "Password must contain a letter.";
  if (!/[0-9]/.test(password)) return "Password must contain a number.";
  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must contain a symbol (e.g. ! ? # $).";
  }
  return null;
}
