// src/lib/verification.ts
// Tamper-evidence for a document that has left the system on paper.
//
// The audit trail proves what happened INSIDE the database. It says nothing
// about the sheet somebody is holding, which could have been edited in Word
// after it was printed and would look identical. The cheap answer to that is a
// hash of the record taken at sign-off, printed on the sheet as a short code:
// anyone holding the paper can type the code in and see whether the record
// still matches what was signed.
//
// This is deliberately NOT a cryptographic signature. It proves the document
// matches a record, and that the record has not changed since it was sealed. It
// does not prove the record itself was not altered by someone with database
// access, which is what a certificate would add and what a PKI would cost.
// Saying so plainly is part of the design: an integrity check that is described
// as more than it is, is worse than none.

import { createHash } from "node:crypto";

// Crockford's alphabet. No I, L, O or U: the first three are misread as 1 and
// 0, and the fourth turns random codes into words nobody wants to read out.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const CODE_PREFIX = "LEE";

/**
 * A stable digest of whatever a record's content is.
 *
 * Keys are sorted, so a change in field ORDER cannot change the hash and make a
 * document look tampered with when nothing was touched. Undefined and null
 * collapse together for the same reason: a column added later and left empty
 * must not invalidate every document sealed before it existed.
 */
export function contentDigest(content: Record<string, unknown>): string {
  return createHash("sha256").update(canonical(content)).digest("hex");
}

export function canonical(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The short code printed on the document, derived from the digest.
 *
 * Eight characters of the hash, which is 40 bits. Uniqueness is enforced by the
 * table rather than trusted from the maths, but at LIMSL's volume a collision
 * would need roughly a million documents to become likely.
 */
export function codeFromDigest(digest: string): string {
  const bytes = Buffer.from(digest.slice(0, 16), "hex");
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 8) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    if (out.length >= 8) break;
  }
  return `${CODE_PREFIX}-${out.slice(0, 4)}-${out.slice(4, 8)}`;
}

/**
 * Accepts a code as somebody would type it off a printed page.
 *
 * Lower case, missing dashes, and the characters people substitute without
 * thinking: O for zero, I or L for one. Refusing those would send somebody back
 * to squint at a sheet that is, from their side, correct.
 */
export function normaliseCode(raw: string): string | null {
  const cleaned = String(raw ?? "")
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/^LEE/, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");

  if (cleaned.length !== 8) return null;
  if ([...cleaned].some((c) => !ALPHABET.includes(c))) return null;
  return `${CODE_PREFIX}-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`;
}

export type SealVerdict =
  | { status: "MATCHES" }
  | { status: "ALTERED" }
  | { status: "UNKNOWN" };

/**
 * Whether the record still matches what was sealed.
 *
 * Three outcomes, not two. "Not found" and "altered" mean different things to
 * whoever is holding the paper: the first is probably a typo, the second is a
 * finding.
 */
export function verifyDigest(sealed: string | null | undefined, current: string): SealVerdict {
  if (!sealed) return { status: "UNKNOWN" };
  return sealed === current ? { status: "MATCHES" } : { status: "ALTERED" };
}
