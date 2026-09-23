// src/lib/__tests__/signing-auth.test.ts
// The PIN check is a security control, and removing it fails silently.
//
// Every signature would keep working. The drawn image would still appear on the
// printed sheet, the audit log would still name somebody, and nothing anywhere
// would look wrong. The only difference is that a tablet left logged in on a
// bench becomes a way to sign as its owner, which is discovered during an
// investigation rather than during a deploy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const ROUTE = readFileSync(join(SRC, "app", "api", "signoffs", "[id]", "route.ts"), "utf8");
const PIN_ROUTE = readFileSync(join(SRC, "app", "api", "account", "signing-pin", "route.ts"), "utf8");

test("signing verifies the PIN against the stored hash", () => {
  // Asserts the whole conditional, not just that verifyPassword is mentioned.
  // The first version of this passed against `if (false && !verifyPassword(…))`,
  // which is precisely the edit somebody makes to get past a failing check
  // locally and forgets to undo.
  //
  // The guard used to require `if (!verifyPassword(…))` exactly, from when the
  // PIN was mandatory for everybody. It now reads the opt-in flag first, and
  // the test below pins that the flag comes from the stored hash rather than
  // from anything the client sent.
  assert.ok(
    /&& !verifyPassword\(String\(body\.signingPin/.test(ROUTE),
    "the signing route no longer checks the PIN, so a tablet left logged in can sign as its owner",
  );
});

test("the PIN is checked on the server, never trusted from the client", () => {
  // A client-side check is a suggestion. The comparison has to happen against
  // the hash, on the server, or the field is decoration.
  assert.ok(/signingPinHash/.test(ROUTE), "the route no longer reads the stored PIN hash");
  assert.ok(
    !/body\.signingPinValid|body\.pinOk/.test(ROUTE),
    "the route trusts a client-supplied verdict on the PIN",
  );
});

test("a PIN the signer has set cannot be skipped by omitting the field", () => {
  // The PIN is optional to ADOPT and mandatory once adopted. The dangerous
  // shape is a route that only checks when the client sends something:
  // `if (body.signingPin && !verifyPassword(...))` reads as a check and is a
  // way to sign as somebody else by sending nothing at all.
  //
  // So the condition must be driven by what the SERVER knows about the signer,
  // hasSigningPin() against the stored hash, and never by the presence of a
  // field in the request.
  assert.ok(
    /signedWithPin = hasSigningPin\(signer\?\.signingPinHash\)/.test(ROUTE),
    "the route no longer decides from the stored hash whether this signer uses a PIN",
  );
  assert.ok(
    /if \(signedWithPin && !verifyPassword\(String\(body\.signingPin/.test(ROUTE),
    "the PIN check is no longer gated on the signer having opted in",
  );
  assert.ok(
    !/if \(body\.signingPin && /.test(ROUTE),
    "the PIN is checked only when the client chooses to send one, which is not a check",
  );
});

test("the signature records whether a PIN backed it", () => {
  // "Signed" is not one claim. A signature resting on the session alone and one
  // the holder protected with a PIN are different evidence, and an auditor must
  // be able to tell them apart years later without reading this file.
  assert.ok(
    /SESSION\+PIN/.test(ROUTE) && /"SESSION"/.test(ROUTE),
    "authMethod no longer distinguishes a PIN-backed signature from a session-only one",
  );
});

test("nobody can set another person's PIN", () => {
  // A PIN an administrator can set is a PIN an administrator can sign with,
  // which is exactly what the PIN exists to prevent.
  assert.ok(
    !/params|searchParams|body\.userId|body\.targetUser/.test(PIN_ROUTE),
    "the signing-pin route accepts a user other than the session's own",
  );
  assert.ok(/actor\.id/.test(PIN_ROUTE), "the route no longer scopes to the session user");
});

test("changing a PIN proves you know the old one", () => {
  assert.ok(
    /verifyPassword\(current, row\.signingPinHash\)/.test(PIN_ROUTE),
    "an existing PIN can now be replaced without knowing it",
  );
});

test("the PIN is stored hashed and never returned", () => {
  assert.ok(/hashPassword\(body\.pin\)/.test(PIN_ROUTE), "the PIN is no longer hashed before storage");

  // The hash may be READ here, that is how the PIN is checked. What must never
  // happen is it leaving in a response. Deriving a boolean from it, which is
  // what the GET does, is exactly the right use and must not trip this, so the
  // rule is stated line by line rather than by trying to parse the call.
  const leaks = PIN_ROUTE.split("\n").filter(
    (line) =>
      line.includes("NextResponse.json") &&
      line.includes("signingPinHash") &&
      !line.includes("hasSigningPin"),
  );
  assert.deepEqual(leaks, [], `a response returns the stored PIN hash:\n${leaks.join("\n")}`);
});

test("how the signer was authenticated is recorded on the signature", () => {
  // An auditor asking "how do you know this was them" reads a column, not a
  // comment in a route.
  assert.ok(/authMethod/.test(ROUTE), "the signature no longer records how it was authenticated");
});
