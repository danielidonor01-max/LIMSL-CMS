// src/lib/scan-redirect.ts
// Where to send somebody who scanned a sticker and is not signed in.
//
// Stickers are glued to machines and outlive the code. This label has encoded
// three different URLs over its life:
//
//   /equipment/LEE-PE-1904/do     the action screen
//   /equipment/LEE-PE-1904        the record
//   /equipment/scan/LEE-PE-1904   the public passport
//
// All three are in the workshop right now, on machines, and a welder holding a
// phone does not know or care which era of sticker they are looking at. Only
// the third is public, so the first two showed a login form to somebody who
// scanned a code to find out whether a machine was safe to touch.
//
// So the rule is by ASSET, not by path: any equipment URL carrying an asset id,
// at any depth, sends an unauthenticated visitor to that asset's passport.
// Reprinting every label in the building is not a fix, and would not reach the
// ones already stuck to machines anyway.
//
// This file is imported by the edge middleware, so it stays pure: no imports,
// no Node APIs, just a string in and a string out.

// Not asset ids. `new` is the create form, and the other two are already public
// so they never reach here, but naming them keeps the rule true on its own
// rather than true only because of what happens to run first.
const NOT_AN_ASSET = new Set(["new", "scan", "qr"]);

/**
 * The passport path for an unauthenticated equipment URL, or null when the
 * request is not about one particular machine.
 */
export function publicScanRedirect(pathname: string): string | null {
  const match = pathname.match(/^\/equipment\/([^/]+)(?:\/.*)?$/);
  if (!match) return null;

  const assetId = match[1];
  if (NOT_AN_ASSET.has(assetId)) return null;

  return `/equipment/scan/${assetId}`;
}
