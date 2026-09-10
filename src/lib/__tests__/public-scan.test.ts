// src/lib/__tests__/public-scan.test.ts
// What a stranger can read off a QR sticker.
//
// The scan passport is deliberately public: somebody standing at a machine, on
// their own phone, not logged in, has to be able to find out whether the thing
// is safe to touch. A login wall there defeats the sticker.
//
// The cost of that decision is that asset IDs run in sequence. Anyone who scans
// one sticker can walk LEE/PE/0001 upward and read whatever this route returns
// for every machine LIMSL owns. So the split between public and signed-in is a
// security boundary, and widening it is a one-line change that nothing else in
// the system would notice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "src");
const ROUTE = readFileSync(
  join(SRC, "app", "api", "equipment", "scan", "[assetId]", "route.ts"),
  "utf8",
);
const AUTH = readFileSync(join(SRC, "auth.config.ts"), "utf8");

// Comments are stripped first. The header of that route explains which fields
// are withheld and why, and naming them there tripped this guard against its
// own documentation.
const code = ROUTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// Everything before `details:` is what an unauthenticated caller receives.
const publicPart = code.slice(0, code.indexOf("details:"));

test("the register is not readable by anyone with a sticker", () => {
  // Serial numbers, makes, models and maintenance history are a facts-about-
  // the-business payload, and enumerable. They belong behind the login.
  for (const field of [
    "serialNumber",
    "oem",
    "model",
    "criticality",
    "commissioningDate",
    "lastMaintenanceDate",
    "nextMaintenanceDate",
    "maintenanceFrequency",
  ]) {
    assert.ok(
      !new RegExp(`\\b${field}:`).test(publicPart),
      `${field} is returned to unauthenticated callers, and asset IDs are sequential`,
    );
  }
});

test("a live permit is a count in public, never its description", () => {
  // That work is happening is a safety fact and belongs on the sticker. What
  // the job is, and when it ends, is a map of the week's operations.
  assert.ok(/activePermitCount/.test(publicPart), "the passport no longer says work is live");
  assert.ok(
    !/workDescription/.test(code),
    "permit work descriptions are exposed on the public passport",
  );
});

test("the private half is gated on the session, not on a request parameter", () => {
  // A flag the caller supplies is not a gate.
  assert.ok(/const session = await auth\(\)/.test(code), "the route no longer reads the session");
  assert.ok(/signedIn\s*\?/.test(code), "the detail block is no longer conditional on signing in");
  assert.ok(
    !/searchParams\.get\(\s*["'](full|details|signedIn)/.test(code),
    "the route lets the caller ask for the private payload",
  );
});

test("no emergency number is ever invented", () => {
  // The first version fell back to two made-up Nigerian numbers when the
  // contacts table was empty, on a public page, as the number to ring about a
  // machine. An empty list is obviously unfinished; a wrong number is
  // discovered by whoever dials it.
  assert.ok(
    !/\+234[\d\s]/.test(code),
    "a phone number is hardcoded in the public scan route",
  );
  assert.ok(
    /orderBy\(asc\(emergencyContacts\.displayOrder\)/.test(code),
    "contacts are no longer ordered, so the fire service can sort below a utility",
  );
});

test("only the scan surfaces are public, and the rest of the app is not", () => {
  // The public prefix list is the whole authentication boundary. A prefix added
  // carelessly here opens everything beneath it.
  const list = AUTH.slice(AUTH.indexOf("PUBLIC_PREFIXES"), AUTH.indexOf("]", AUTH.indexOf("PUBLIC_PREFIXES")));
  const allowed = [
    "/login",
    "/api/auth",
    "/equipment/qr",
    "/equipment/scan",
    "/api/equipment/scan",
    "/offline",
    "/forgot-password",
    "/reset-password",
    "/account/confirm-email",
  ];
  for (const prefix of [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1])) {
    if (prefix === "PUBLIC_PREFIXES") continue;
    assert.ok(allowed.includes(prefix), `"${prefix}" was made public without being considered`);
  }
});

test("PPE on the passport comes from the list the permit uses", () => {
  // A second PPE vocabulary is how "Safety Goggles" and "Safety Glasses" end up
  // meaning the same thing on two documents about one job.
  assert.ok(/ppeForCategory/.test(code), "the passport no longer uses the shared PPE mapping");
  assert.ok(
    !/categoryPPE|Steel-Toe/.test(code),
    "the scan route has grown its own PPE list again",
  );
});
