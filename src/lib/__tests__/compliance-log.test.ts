import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildQuarterLog,
  logHeadline,
  logYears,
  outcomeOf,
  quarterOf,
  type LogActivity,
} from "@/lib/maintenance/compliance-log";

const TODAY = "2026-11-20";

const row = (over: Partial<LogActivity> = {}): LogActivity => ({
  id: Math.random().toString(36).slice(2),
  plannedDate: "2026-08-10",
  activityType: "PM",
  status: "COMPLETED",
  completedDate: "2026-08-10",
  maintenanceFrequency: "QUARTERLY",
  category: "WELDING",
  equipmentName: "Welder 1",
  assetId: "LEE/PE/0001",
  ...over,
});

test("a quarter is read from the planned date", () => {
  assert.equal(quarterOf("2026-01-01"), 1);
  assert.equal(quarterOf("2026-03-31"), 1);
  assert.equal(quarterOf("2026-04-01"), 2);
  assert.equal(quarterOf("2026-09-30"), 3);
  assert.equal(quarterOf("2026-12-31"), 4);
});

test("done on the day, done late inside the window and done too late are told apart", () => {
  assert.equal(outcomeOf(row(), TODAY).outcome, "ON_TIME");
  assert.equal(outcomeOf(row({ completedDate: "2026-08-05" }), TODAY).outcome, "ON_TIME");
  const late = outcomeOf(row({ completedDate: "2026-08-20T09:00:00.000Z" }), TODAY);
  assert.deepEqual([late.outcome, late.daysLate], ["LATE", 10]);
  assert.equal(outcomeOf(row({ completedDate: "2026-09-10" }), TODAY).outcome, "OUTSIDE_WINDOW");
});

test("overdue and deferred work counts against the quarter; work not yet due is left out", () => {
  assert.equal(outcomeOf(row({ status: "OVERDUE", completedDate: null }), TODAY).outcome, "OUTSTANDING");
  assert.equal(outcomeOf(row({ status: "DEFERRED", completedDate: null }), TODAY).outcome, "DEFERRED");
  assert.equal(
    outcomeOf(row({ status: "SCHEDULED", completedDate: null, plannedDate: "2026-12-05" }), TODAY).outcome,
    "NOT_DUE",
  );

  const log = buildQuarterLog(
    [
      row({ plannedDate: "2026-10-05", completedDate: "2026-10-05" }),
      row({ plannedDate: "2026-10-06", completedDate: "2026-10-12" }),
      row({ plannedDate: "2026-10-07", status: "OVERDUE", completedDate: null }),
      row({ plannedDate: "2026-10-08", status: "DEFERRED", completedDate: null }),
      row({ plannedDate: "2026-12-10", status: "SCHEDULED", completedDate: null }),
    ],
    { year: 2026, quarter: 4, activityType: "PM", today: TODAY },
  );
  assert.equal(log.total.planned, 5);
  assert.equal(log.total.due, 4);
  assert.equal(log.total.compliant, 2);
  assert.equal(log.total.compliancePct, 50);
  assert.match(logHeadline(log, "PMs"), /^2 of 4 PMs due in Q4 2026 done on time: 50% compliance\.$/);
});

test("compliance never rounds its way up to the target", () => {
  const rows = [
    ...Array.from({ length: 189 }, () => row()),
    ...Array.from({ length: 10 }, () => row({ status: "OVERDUE", completedDate: null })),
  ];
  // 189 of 199 is 94.97%.
  const log = buildQuarterLog(rows, { year: 2026, quarter: 3, activityType: "PM", today: TODAY });
  assert.equal(log.total.compliancePct, 94);
});

test("the log keeps to its own quarter, kind of work and year, and leaves earthing to its module", () => {
  const log = buildQuarterLog(
    [
      row({ id: "a" }),
      row({ id: "b", activityType: "INS" }),
      row({ id: "c", plannedDate: "2026-02-10", completedDate: "2026-02-10" }),
      row({ id: "d", plannedDate: "2025-08-10", completedDate: "2025-08-10" }),
      row({ id: "e", category: "EARTHING", status: "OVERDUE", completedDate: null }),
      row({ id: "f", category: "CRANE", status: "OVERDUE", completedDate: null }),
    ],
    { year: 2026, quarter: 3, activityType: "PM", today: TODAY },
  );
  assert.deepEqual(log.entries.map((e) => e.id).sort(), ["a", "f"]);
  assert.deepEqual(
    log.byCategory.map((c) => [c.category, c.tally.compliancePct]).sort(),
    [
      ["CRANE", 0],
      ["WELDING", 100],
    ],
  );
  assert.deepEqual(
    log.quarters.map((q) => q.tally.planned),
    [1, 0, 2, 0],
  );
  assert.equal(log.quarters[1].tally.compliancePct, null);
  assert.deepEqual(logYears([row(), row({ plannedDate: "2025-08-10" })]), [2026, 2025]);
});

test("the schedule opens on all activities, and Log is the last tab", () => {
  const page = readFileSync("src/app/schedule/page.tsx", "utf8");
  assert.match(page, /useState<"all" \| "upcoming" \| "deferred" \| "log">\("all"\)/);
  const order = ['value: "all", label: "All activities"', 'value: "upcoming"', 'value: "deferred"', 'value: "log", label: "Log"'].map(
    (s) => page.indexOf(s),
  );
  assert.ok(order.every((i) => i > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("both logs print alone, under the company letterhead", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /\[data-print-solo\] > :not\(\[data-print-keep\]\)/);
  const earthingLog = readFileSync("src/components/EarthingLog.tsx", "utf8");
  assert.match(earthingLog, /<PrintLetterhead/);
  assert.match(earthingLog, /window\.print\(\)/);
  // The schedule record is a document of its own: cover, running header, numbered footer.
  const scheduleLog = readFileSync("src/components/ScheduleComplianceLog.tsx", "utf8");
  assert.match(scheduleLog, /window\.print\(\)/);
  assert.match(scheduleLog, /className="report-cover"/);
  assert.match(scheduleLog, /\/brand\/logo-80\.png/);
  assert.match(css, /@page report \{[\s\S]*counter\(page\) " of " counter\(pages\)/);
  assert.match(css, /@page report:first/);
  assert.match(readFileSync("src/components/PrintLetterhead.tsx", "utf8"), /\/brand\/logo-80\.png/);
  const earthing = readFileSync("src/app/earthing/page.tsx", "utf8");
  assert.match(earthing, /\{ value: "trends", label: "Trends" \},\s+\{ value: "log", label: "Log" \}/);
  assert.match(earthing, /label: "Next measurement"/);
});
