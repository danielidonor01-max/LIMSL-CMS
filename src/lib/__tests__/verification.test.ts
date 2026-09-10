// src/lib/__tests__/verification.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contentDigest,
  codeFromDigest,
  normaliseCode,
  verifyDigest,
  canonical,
  CODE_PREFIX,
} from "@/lib/verification";

test("the same content always hashes the same, whatever order it arrives in", () => {
  // Field order changes with a refactor, a column rename, a different SELECT.
  // If order moved the hash, every sealed document in the system would read as
  // tampered with the next time somebody tidied a query.
  const a = contentDigest({ permitNumber: "PTW-1", holder: "Emeka", days: 7 });
  const b = contentDigest({ days: 7, holder: "Emeka", permitNumber: "PTW-1" });
  assert.equal(a, b);
});

test("a column added later and left empty does not invalidate old documents", () => {
  // Empty, null and absent all mean "nothing here". Treating them differently
  // would break every seal taken before the column existed.
  const before = contentDigest({ permitNumber: "PTW-1" });
  assert.equal(contentDigest({ permitNumber: "PTW-1", newField: null }), before);
  assert.equal(contentDigest({ permitNumber: "PTW-1", newField: undefined }), before);
  assert.equal(contentDigest({ permitNumber: "PTW-1", newField: "" }), before);
});

test("changing anything that matters changes the hash", () => {
  const base = contentDigest({ permitNumber: "PTW-1", holder: "Emeka", days: 7 });
  assert.notEqual(base, contentDigest({ permitNumber: "PTW-1", holder: "Chukwudi", days: 7 }));
  assert.notEqual(base, contentDigest({ permitNumber: "PTW-1", holder: "Emeka", days: 14 }));
  assert.notEqual(base, contentDigest({ permitNumber: "PTW-2", holder: "Emeka", days: 7 }));
});

test("nested content is canonicalised too", () => {
  // A permit's precaution marks are a nested object. Sorting only the top level
  // would let the same permit hash two ways.
  const a = contentDigest({ marks: { b: "YES", a: "NA" }, steps: [{ x: 1, y: 2 }] });
  const b = contentDigest({ marks: { a: "NA", b: "YES" }, steps: [{ y: 2, x: 1 }] });
  assert.equal(a, b);
  assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}');
});

test("array order is preserved, because it is content", () => {
  // Job steps in a hazard analysis are a sequence. Re-ordering them changes the
  // method, so it must change the hash.
  assert.notEqual(contentDigest({ steps: ["purge", "cut"] }), contentDigest({ steps: ["cut", "purge"] }));
});

test("the printed code is short, readable and stable", () => {
  const digest = contentDigest({ permitNumber: "PTW-2026-0001" });
  const code = codeFromDigest(digest);
  assert.match(code, /^LEE-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal(codeFromDigest(digest), code, "the same digest gives a different code each time");
  // No characters that get misread off a printed page.
  assert.ok(!/[ILOU]/.test(code.replace(CODE_PREFIX, "")), `${code} contains a confusable character`);
});

test("a code is accepted the way somebody would type it off a page", () => {
  const canonicalCode = codeFromDigest(contentDigest({ x: 1 }));
  const body = canonicalCode.replace("LEE-", "").replace("-", "");

  for (const typed of [
    canonicalCode,
    canonicalCode.toLowerCase(),
    canonicalCode.replace(/-/g, ""),
    canonicalCode.replace(/-/g, " "),
    body,
  ]) {
    assert.equal(normaliseCode(typed), canonicalCode, `"${typed}" should be accepted`);
  }
});

test("the characters people substitute without thinking are mapped, not refused", () => {
  // O for zero and I or L for one. Refusing them sends somebody back to squint
  // at a sheet that is, from their side, correct.
  assert.equal(normaliseCode("LEE-O123-4567"), "LEE-0123-4567");
  assert.equal(normaliseCode("LEE-I234-5678"), "LEE-1234-5678");
  assert.equal(normaliseCode("LEE-L234-5678"), "LEE-1234-5678");
});

test("a code of the wrong length is refused rather than padded", () => {
  for (const bad of ["", "LEE-123", "LEE-12345-6789", "LEE-12-34"]) {
    assert.equal(normaliseCode(bad), null, `"${bad}" should be refused`);
  }
});

test("a well-formed code that does not exist is the lookup's problem, not this one", () => {
  // "nonsense" is eight characters that all survive the substitutions, so it
  // normalises to LEE-N0NS-ENSE. That is correct: this function validates the
  // SHAPE of a code. Whether such a document exists is a database question, and
  // conflating the two would mean refusing valid codes for records this
  // function knows nothing about.
  assert.equal(normaliseCode("nonsense"), "LEE-N0NS-ENSE");
});

test("not found and altered are different answers", () => {
  // To somebody holding the paper the first is probably a typo and the second
  // is a finding. Collapsing them into "invalid" loses the distinction that
  // matters.
  assert.deepEqual(verifyDigest("abc", "abc"), { status: "MATCHES" });
  assert.deepEqual(verifyDigest("abc", "def"), { status: "ALTERED" });
  assert.deepEqual(verifyDigest(null, "def"), { status: "UNKNOWN" });
  assert.deepEqual(verifyDigest(undefined, "def"), { status: "UNKNOWN" });
});
