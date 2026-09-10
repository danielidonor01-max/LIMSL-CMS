// src/lib/__tests__/scan-redirect.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { publicScanRedirect } from "@/lib/scan-redirect";

test("every sticker format ever printed reaches the passport", () => {
  // The three URLs this label has encoded over its life. All three are on
  // machines in the workshop right now, and a welder holding a phone does not
  // know which era of sticker they are looking at.
  assert.equal(publicScanRedirect("/equipment/LEE-PE-1904/do"), "/equipment/scan/LEE-PE-1904");
  assert.equal(publicScanRedirect("/equipment/LEE-PE-1904"), "/equipment/scan/LEE-PE-1904");
  // The current one is already public and never reaches this, but the rule has
  // to be true on its own rather than true because of ordering elsewhere.
  assert.equal(publicScanRedirect("/equipment/scan/LEE-PE-1904"), null);
});

test("any depth under an asset still lands on that asset", () => {
  // /do was the one in the field. The others exist and a stale link, a
  // bookmark or a future sticker could carry any of them.
  for (const tail of ["do", "edit", "history", "troubleshoot", "do/step/2"]) {
    assert.equal(
      publicScanRedirect(`/equipment/LEE-PE-1904/${tail}`),
      "/equipment/scan/LEE-PE-1904",
      `/${tail} does not reach the passport`,
    );
  }
});

test("the register itself is not a machine", () => {
  // Somebody browsing to the asset register while logged out wants the login
  // page. There is no asset to show them a passport for.
  assert.equal(publicScanRedirect("/equipment"), null);
  assert.equal(publicScanRedirect("/equipment/"), null);
});

test("the create form is not an asset id", () => {
  // /equipment/new would otherwise redirect to a passport for a machine called
  // "new", which 404s and looks like the app is broken.
  assert.equal(publicScanRedirect("/equipment/new"), null);
  assert.equal(publicScanRedirect("/equipment/qr/LEE-PE-1904"), null);
});

test("nothing outside the equipment tree is touched", () => {
  for (const path of ["/", "/permits/abc", "/api/equipment/LEE-PE-1904", "/equipments/LEE-PE-1904"]) {
    assert.equal(publicScanRedirect(path), null, `${path} should be left alone`);
  }
});

test("the asset id is passed through exactly as it arrived", () => {
  // The passport un-dashes it back to LEE/PE/1904 itself. Re-encoding here
  // would double up and the lookup would miss.
  assert.equal(publicScanRedirect("/equipment/LEE-OE-2232"), "/equipment/scan/LEE-OE-2232");
  assert.equal(publicScanRedirect("/equipment/LEE-SYS-0007/do"), "/equipment/scan/LEE-SYS-0007");
});
