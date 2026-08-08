import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Search covered four modules for most of this project's life, and every module
// added afterwards silently did not join — so by the end of Phase 6 the search
// bar could not find permits, spares, calibration, emergency equipment,
// contractors, non-conformities or training: the majority of the app.
//
// Nothing failed when that happened. The bar still worked, it just quietly knew
// less each time the product grew. This test is the thing that would have
// noticed.
const route = readFileSync(join(process.cwd(), "src", "app", "api", "search", "route.ts"), "utf8");

// Record-holding modules a person would look for by name or number. Reference
// pages (reports, KPI, audit log, settings) hold no findable records of their
// own and are excluded deliberately.
const SEARCHABLE_MODULES = [
  "equipment",
  "work-orders",
  "corrective",
  "wms",
  "permits",
  "spares",
  "calibration",
  "emergency",
  "contractors",
  "training",
];

const TABLE_FOR: Record<string, string> = {
  equipment: "equipment",
  "work-orders": "workOrders",
  corrective: "correctiveMaintenance",
  wms: "wmsDocuments",
  permits: "permits",
  spares: "spareParts",
  calibration: "calibrationRecords",
  emergency: "emergencyEquipment",
  contractors: "contractors",
  training: "trainingRecords",
};

test("every record-holding module is reachable from global search", () => {
  const missing = SEARCHABLE_MODULES.filter((m) => !route.includes(`.from(${TABLE_FOR[m]})`));
  assert.deepEqual(
    missing,
    [],
    `these modules hold records but global search does not query them: ${missing.join(", ")}`,
  );
});

// Catches the actual regression: someone ships a new module with a page and a
// table, and forgets this file. The list above then has to be updated
// deliberately, which is the point at which they notice.
test("no page-level module has appeared without being considered for search", () => {
  const appDir = join(process.cwd(), "src", "app");
  const known = new Set([
    ...SEARCHABLE_MODULES,
    // Reference and admin surfaces — nothing to look up by name.
    "api", "login", "change-password", "account", "notifications", "settings",
    "reports", "kpi", "audit", "documents", "procedure", "oem", "schedule", "offline",
  ]);

  const routed = readdirSync(appDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("(") && !d.name.startsWith("_"))
    .filter((d) => existsSync(join(appDir, d.name, "page.tsx")))
    .map((d) => d.name);

  const unconsidered = routed.filter((r) => !known.has(r));
  assert.deepEqual(
    unconsidered,
    [],
    `new module(s) ${unconsidered.join(", ")} — add to SEARCHABLE_MODULES and the search route, ` +
      `or to the known-reference list if they hold nothing findable`,
  );
});

test("each queried module contributes a labelled result type", () => {
  for (const type of ["Equipment", "Work Order", "Corrective", "WMS", "Permit", "Spare", "Instrument", "Emergency", "Contractor", "Training"]) {
    assert.ok(route.includes(`type: "${type}"`), `${type} results are queried but never returned`);
  }
});

// This runs on every keystroke of the typeahead. Loading whole tables into JS
// to filter them there is the version of this feature that takes the app down.
test("search filters in SQL with a bounded result set", () => {
  assert.match(route, /ilike\(/, "filtering must happen in SQL");
  assert.match(route, /\.limit\(PER_ENTITY\)/, "every query must be bounded");
  assert.ok(!/\.from\(\w+\)\s*;/.test(route), "no unfiltered table read");
});

test("LIKE wildcards in user input are escaped", () => {
  assert.match(route, /replace\(\/\[%_\\\\\]\/g/, "a literal % must not become a wildcard scan");
});
