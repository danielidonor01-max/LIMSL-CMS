// src/lib/__tests__/page-title.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sectionTitle, pageTitle, APP_NAME } from "../page-title";

test("the dashboard is matched exactly, not as a prefix of everything", () => {
  assert.equal(sectionTitle("/"), "Dashboard");
  assert.equal(sectionTitle("/equipment"), "Equipment");
});

test("the longest matching prefix wins", () => {
  // /audit/logs must not resolve through a shorter /audit entry.
  assert.equal(sectionTitle("/audit/logs"), "Audit Log");
  assert.equal(sectionTitle("/audit/risks"), "Risk Register");
  assert.equal(sectionTitle("/settings/users"), "Users");
  assert.equal(sectionTitle("/settings"), "App Settings");
});

test("a record page inherits its section", () => {
  assert.equal(sectionTitle("/work-orders/abc123"), "Work Orders");
  assert.equal(sectionTitle("/equipment/LEE-PE-1904"), "Equipment");
  assert.equal(sectionTitle("/permits/xyz/renew"), "Permits (PTW)");
});

test("prefix matching is segment-aware", () => {
  // /jhaX is not inside /jha.
  assert.equal(sectionTitle("/jhaX"), null);
  assert.equal(sectionTitle("/nowhere"), null);
});

test("the reference leads, because that is what separates two open tabs", () => {
  assert.equal(pageTitle("/work-orders/a1", "WO-2026-0031"), `WO-2026-0031 · Work Orders · ${APP_NAME}`);
  assert.equal(pageTitle("/work-orders"), `Work Orders · ${APP_NAME}`);
});

test("an unknown route still names the app rather than going blank", () => {
  assert.equal(pageTitle("/nowhere"), APP_NAME);
});

test("a blank reference does not leave a dangling separator", () => {
  assert.equal(pageTitle("/schedule", "   "), `Schedule · ${APP_NAME}`);
  assert.equal(pageTitle("/schedule", null), `Schedule · ${APP_NAME}`);
});

test("every sidebar destination has a title, and they use the same words", () => {
  // A page called one thing in the nav and another in the browser tab is worse
  // than no title at all. This is what keeps the two from drifting.
  const sidebar = readFileSync(join(process.cwd(), "src", "components", "Sidebar.tsx"), "utf8");
  const entries = [...sidebar.matchAll(/href:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)];

  assert.ok(entries.length > 15, "could not read the nav items out of Sidebar");

  const missing: string[] = [];
  const mismatched: string[] = [];
  for (const [, href, label] of entries) {
    const title = sectionTitle(href);
    if (!title) missing.push(href);
    else if (title !== label) mismatched.push(`${href}: nav says "${label}", title says "${title}"`);
  }

  assert.deepEqual(missing, [], `these nav destinations have no browser title:\n${missing.join("\n")}`);
  assert.deepEqual(mismatched, [], `nav label and browser title disagree:\n${mismatched.join("\n")}`);
});
