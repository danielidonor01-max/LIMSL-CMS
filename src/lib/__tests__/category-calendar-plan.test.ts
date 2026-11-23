import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { upcomingCategoryDates, type CalendarCategory } from "@/lib/maintenance/plan-generation";

const cats: CalendarCategory[] = [
  { code: "CRANE", maintenanceFrequency: "BI_MONTHLY", defaultStartDate: "2026-01-20" },
  { code: "FACILITY_AC", maintenanceFrequency: "QUARTERLY", defaultStartDate: "2026-02-09" },
  { code: "NO_START", maintenanceFrequency: "QUARTERLY", defaultStartDate: null },
];

test("a category's machines are planned on what is left of its year and the first day of the next", () => {
  assert.deepEqual(upcomingCategoryDates(cats, "CRANE", "2026-08-01"), ["2026-09-21", "2026-11-20", "2027-01-20"]);
  // Today's round still counts as ahead.
  assert.deepEqual(upcomingCategoryDates(cats, "CRANE", "2026-11-20"), ["2026-11-20", "2027-01-20"]);
});

test("once the year's last round has passed, a machine still has a visit ahead of it", () => {
  assert.deepEqual(upcomingCategoryDates(cats, "FACILITY_AC", "2026-11-23"), ["2027-02-09"]);
  assert.deepEqual(upcomingCategoryDates(cats, "CRANE", "2026-11-23"), ["2027-01-20"]);
});

test("the dates depend on the category and the day only, never on the machine", () => {
  // Nothing about a machine is an input, so two machines of one category
  // cannot be given different days.
  assert.equal(upcomingCategoryDates.length, 3);
  assert.deepEqual(upcomingCategoryDates(cats, "NO_START", "2026-11-23"), []);
  assert.deepEqual(upcomingCategoryDates(cats, "MISSING", "2026-11-23"), []);
});

test("forward planning and the daily keep-alive both use the category's days", () => {
  const sync = readFileSync("src/lib/maintenance/plan-sync.ts", "utf8");
  assert.match(sync, /upcomingCategoryDates\(categories, own\.code, notBefore\)/);
  assert.match(sync, /year: Number\(g\.plannedDate\.slice\(0, 4\)\)/);
  const schedule = readFileSync("src/lib/schedule.ts", "utf8");
  assert.match(schedule, /await syncPlanForEquipment\(m, \{ notBefore: today \}\)/);
  assert.match(schedule, /m\.removedAt \|\| m\.status === "DECOMMISSIONED" \|\| !m\.category/);
});

test("the alignment script reports by default, leaves decisions alone and adds nothing in the past", () => {
  const src = readFileSync("src/lib/db/align-plan-to-categories.ts", "utf8");
  assert.match(src, /if \(!APPLY\) process\.exit\(0\);/);
  assert.match(src, /isReplannable\(r, today\) && !wanted\.includes/);
  assert.match(src, /upcomingCategoryDates\(cats, cat\.code, today\)/);
  assert.doesNotMatch(src, /status: "(OVERDUE|COMPLETED)"/);
});

test("a moved machine's past PMs stay under the category they were done in", () => {
  const lib = readFileSync("src/lib/maintenance/asset-categories.ts", "utf8");
  // What it has done keeps the old category; what it still owes takes the new one.
  assert.match(lib, /set\(\{ plannedCategory: from \}\)[\s\S]{0,160}isNull\(maintenanceSchedule\.plannedCategory\)/);
  assert.match(lib, /set\(\{ plannedCategory: to \}\)[\s\S]{0,160}ne\(maintenanceSchedule\.status, "COMPLETED"\)/);
  for (const f of ["src/app/api/asset-categories/move/route.ts", "src/app/api/equipment/[assetId]/route.ts"]) {
    assert.match(readFileSync(f, "utf8"), /await carryPlanOnMove\(/, f);
  }
  // The schedule, and so the Log, reads the visit's own category first.
  assert.match(
    readFileSync("src/app/api/schedule/route.ts", "utf8"),
    /coalesce\(\$\{maintenanceSchedule\.plannedCategory\}, \$\{equipment\.category\}\)/,
  );
});

test("every way a visit is planned records its category", () => {
  assert.match(readFileSync("src/lib/maintenance/plan-sync.ts", "utf8"), /plannedCategory: machine\.category \?\? null/);
  assert.match(readFileSync("src/lib/schedule.ts", "utf8"), /plannedCategory: machine\?\.category \?\? null/);
  assert.match(readFileSync("src/app/api/schedule/route.ts", "utf8"), /plannedCategory: eq0\.category \?\? null/);
  // Imports are caught by the daily fill.
  assert.match(readFileSync("src/lib/schedule.ts", "utf8"), /await fillPlannedCategories\(\)/);
});

test("the alignment keeps one catch-up visit where a machine would outrun its interval", () => {
  const src = readFileSync("src/lib/db/align-plan-to-categories.ts", "utf8");
  assert.match(src, /next\.slice\(0, 4\) > today\.slice\(0, 4\)/);
  assert.match(src, /if \(r === keep\) continue;/);
});
