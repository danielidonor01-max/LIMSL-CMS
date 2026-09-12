// scripts/shoot.mjs — sign in and screenshot the real pages.
//
// Everything visual so far has been verified against a markup harness, because
// the pages worth improving all need a session and data and there was neither.
// With the local database up, this signs in properly and captures the actual
// screens, which is the only way to see a table with forty rows in it, an empty
// state, or a page mid-load.
//
// Drives the Chrome already installed rather than downloading one, which is
// why the dependency is puppeteer-core and not puppeteer.
//
//   node scripts/shoot.mjs                      everything, desktop
//   node scripts/shoot.mjs --only /equipment    one page
//   node scripts/shoot.mjs --width 390          phone
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BASE = process.env.SHOOT_BASE ?? "http://localhost:3100";
const OUT = process.env.SHOOT_OUT ?? ".tmp-shots";
const EMAIL = "daniel.idonor@limsl.com";
const PASSWORD = "limsl2026";

const arg = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const WIDTH = Number(arg("--width", 1440));
const HEIGHT = Number(arg("--height", 900));
const ONLY = arg("--only", null);

const PAGES = [
  ["dashboard", "/"],
  ["equipment", "/equipment"],
  ["work-orders", "/work-orders"],
  ["schedule", "/schedule"],
  ["corrective", "/corrective"],
  ["permits", "/permits"],
  ["kpi", "/kpi"],
  ["approvals", "/approvals"],
  ["my-tasks", "/my-tasks"],
  ["reports", "/reports"],
  ["emergency", "/emergency"],
  ["spares", "/spares"],
  ["notifications", "/notifications"],
];

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  defaultViewport: { width: WIDTH, height: HEIGHT },
});

const page = await browser.newPage();

// The service worker caches the app shell and will happily serve a stale page
// over a fresh build. It has already made two screenshots lie in this project.
await page.setBypassServiceWorker(true);

console.log("signing in…");
await page.goto(`${BASE}/login`, { waitUntil: "networkidle2" });
await page.type('input[type="email"]', EMAIL);
await page.type('input[type="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle2" }).catch(() => {}),
  page.click('button[type="submit"]'),
]);

// A forced password change on first login lands here and would make every
// screenshot a picture of the same form.
if (page.url().includes("/change-password")) {
  console.error("stopped at the forced password change. Seeded accounts need");
  console.error("their first-login flag cleared before pages can be captured.");
  await browser.close();
  process.exit(2);
}
console.log("signed in, landed on", page.url());

for (const [name, path] of PAGES) {
  if (ONLY && path !== ONLY) continue;
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 45000 });
    // Client pages fetch after mount; networkidle2 fires before the list lands.
    await new Promise((r) => setTimeout(r, 1200));
    const file = join(OUT, `${name}-${WIDTH}.png`);
    await page.screenshot({ path: file });
    console.log("captured", path, "->", file);
  } catch (err) {
    console.error("failed", path, err.message);
  }
}

await browser.close();
console.log("done");
