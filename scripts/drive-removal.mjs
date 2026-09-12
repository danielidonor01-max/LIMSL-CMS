// scripts/drive-removal.mjs — exercise both removal paths against the real app.
//
// AGENTS.md: "Run the app and drive the actual flow; a typecheck is not
// verification." This signs in as the Super Admin and puts every branch of the
// removal API through its paces, then leaves the database as it found it.
import puppeteer from "puppeteer-core";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = "http://localhost:3100";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.setBypassServiceWorker(true);

await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type('input[type="email"]', "daniel.idonor@limsl.com");
await page.type('input[type="password"]', "limsl2026");
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
if (page.url().includes("/login")) {
  console.error("could not sign in");
  await browser.close();
  process.exit(1);
}

// Runs inside the page, so the session cookie rides along automatically.
const call = (path, method, body) =>
  page.evaluate(
    async (p, m, b) => {
      const res = await fetch(p, {
        method: m,
        headers: { "Content-Type": "application/json" },
        body: b ? JSON.stringify(b) : undefined,
      });
      let data = null;
      try { data = await res.json(); } catch {}
      return { status: res.status, data };
    },
    path,
    method,
    body ?? null,
  );

const assets = await page.evaluate(() => fetch("/api/equipment").then((r) => r.json()));
const withHistory = assets.find((a) => a.assetId === "LEE/PE/0159") ?? assets[0];
const spare = assets.find((a) => a.assetId?.startsWith("LEE/OE/")) ?? assets[1];

let failures = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  (got ${got}, want ${want})`);
};

console.log(`\nusing: ${withHistory.assetId} (has history) and ${spare.assetId} (spare)\n`);

// ── Deleting ────────────────────────────────────────────────────────────────
let r = await call(`/api/equipment/${withHistory.assetId.replace(/\//g, "-")}/removal`, "DELETE", {
  password: "wrong-password",
});
check("delete with a wrong password is refused", r.status, 409);

r = await call(`/api/equipment/${withHistory.assetId.replace(/\//g, "-")}/removal`, "DELETE", {
  password: "LIMSL123",
});
check("delete of an asset with history is refused even with the right password", r.status, 409);
console.log(`      refusal: ${r.data?.error?.slice(0, 130)}…`);
if (!/cannot be deleted/i.test(r.data?.error ?? "")) {
  console.log("FAIL  the refusal does not explain itself");
  failures++;
}

// ── Retiring ────────────────────────────────────────────────────────────────
const tag = spare.assetId.replace(/\//g, "-");
r = await call(`/api/equipment/${tag}/removal`, "POST", {});
check("removal with no reason is refused", r.status, 400);

r = await call(`/api/equipment/${tag}/removal`, "POST", { reason: "OTHER" });
check('removal as "other" with no note is refused', r.status, 400);

r = await call(`/api/equipment/${tag}/removal`, "POST", {
  reason: "SOLD",
  note: "Driven by scripts/drive-removal.mjs",
});
check("removal with a reason succeeds", r.status, 200);

r = await call(`/api/equipment/${tag}/removal`, "POST", { reason: "SOLD" });
check("removing an already-removed asset is refused", r.status, 400);

const after = await page.evaluate(() => fetch("/api/equipment").then((r) => r.json()));
const removed = after.find((a) => a.assetId === spare.assetId);
check("the asset carries its removal reason", removed?.removedReason, "SOLD");
check("the asset records who removed it", removed?.removedByName, "Daniel Idonor");

// ── Restoring, which also puts the database back ────────────────────────────
r = await call(`/api/equipment/${tag}/removal`, "PATCH");
check("restoring puts it back", r.status, 200);

const restored = await page.evaluate(() => fetch("/api/equipment").then((r) => r.json()));
check(
  "the asset is on the register again",
  restored.find((a) => a.assetId === spare.assetId)?.removedAt ?? null,
  null,
);

await browser.close();
console.log(failures === 0 ? "\nall paths behaved" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
