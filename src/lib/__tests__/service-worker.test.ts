import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The service worker is plain browser JS and cannot import from src, so these
// assert its policy by reading the file. That is deliberate: the rules below are
// the ones a future "let's cache the API too, it'll feel faster" change would
// quietly break, and this is what makes that change fail loudly instead.
const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
const middleware = readFileSync(join(process.cwd(), "src", "middleware.ts"), "utf8");

// Assertions about what the worker DOES must read the code, not the prose that
// explains it, the header comment says "not stale-while-revalidate", and a
// naive search finds that and fails.
const swCode = sw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// THE rule. In a maintenance system a cached API response is not a convenience,
// it is a safety problem: a machine that read OPERATIONAL an hour ago may be
// isolated and locked out now.
test("the worker never serves API responses from cache", () => {
  assert.match(
    swCode,
    /url\.pathname\.startsWith\("\/api\/"\)\)\s*return;/,
    "requests to /api/ must bail out of the fetch handler before any caching",
  );
  // Guard against the specific "improvement" that would break it.
  assert.ok(
    !/staleWhileRevalidate|stale-while-revalidate/i.test(swCode),
    "no stale-while-revalidate strategy may be introduced for data",
  );
});

test("auth is always fetched from the network", () => {
  assert.match(swCode, /\/auth/, "auth paths must be excluded from caching");
});

test("only GET requests are intercepted", () => {
  assert.match(swCode, /request\.method !== "GET"/, "a cached POST would replay a mutation");
});

test("cross-origin requests are left alone", () => {
  assert.match(swCode, /url\.origin !== self\.location\.origin/);
});

test("an offline fallback page is precached at install", () => {
  assert.match(swCode, /OFFLINE_URL/);
  assert.match(swCode, /cache\.addAll\(\[OFFLINE_URL\]\)/);
});

test("old cache versions are cleared on activate", () => {
  assert.match(swCode, /caches\.delete/, "a version bump must evict the previous shell");
});

// Without this the worker is redirected to /login, never registers, and the
// whole feature silently does nothing.
test("the middleware matcher lets /sw.js through unauthenticated", () => {
  assert.match(middleware, /sw\\\\\.js/, "sw.js must be excluded from the auth matcher");
});

test("the offline page is public, a sign-in form cannot submit with no network", () => {
  const authConfig = readFileSync(join(process.cwd(), "src", "auth.config.ts"), "utf8");
  assert.match(authConfig, /"\/offline"/);
});
