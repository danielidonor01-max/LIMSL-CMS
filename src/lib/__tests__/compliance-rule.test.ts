import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_COMPLIANCE_RULE,
  describeRule,
  normaliseComplianceRule,
  validateComplianceRule,
  windowDaysFor,
  type ComplianceRule,
} from "@/lib/maintenance/compliance-rule";
import { complianceTally, outcomeOf, type LogActivity } from "@/lib/maintenance/compliance-log";
import { tooCloseTo } from "@/lib/maintenance/round-spacing";

const row = (over: Partial<LogActivity> = {}): LogActivity => ({
  id: Math.random().toString(36).slice(2),
  plannedDate: "2026-11-10",
  activityType: "PM",
  status: "OVERDUE",
  completedDate: null,
  maintenanceFrequency: "QUARTERLY",
  category: "WELDING",
  equipmentName: "W",
  assetId: "A",
  ...over,
});
const onDueDate: ComplianceRule = { ...DEFAULT_COMPLIANCE_RULE, countFrom: "DUE_DATE" };

test("the standard rule judges unfinished work when its window closes", () => {
  assert.equal(DEFAULT_COMPLIANCE_RULE.countFrom, "WINDOW_CLOSED");
  // Quarterly: 14 days. Planned 10 Nov, so the window's last day is 24 Nov.
  assert.equal(outcomeOf(row(), "2026-11-10").outcome, "OPEN");
  assert.equal(outcomeOf(row(), "2026-11-24").outcome, "OPEN");
  assert.equal(outcomeOf(row(), "2026-11-25").outcome, "OUTSTANDING");
  assert.equal(outcomeOf(row({ plannedDate: "2026-11-30", status: "SCHEDULED" }), "2026-11-20").outcome, "NOT_DUE");
});

test("counting from the due date still leaves the due day itself open", () => {
  assert.equal(outcomeOf(row(), "2026-11-10", onDueDate).outcome, "OPEN");
  assert.equal(outcomeOf(row(), "2026-11-11", onDueDate).outcome, "OUTSTANDING");
});

test("open work is left out of the percentage, and counted once judged", () => {
  const rows = [
    row({ status: "COMPLETED", completedDate: "2026-11-10" }),
    row(),
    row({ plannedDate: "2026-12-05", status: "SCHEDULED" }),
  ];
  const open = complianceTally(rows, "2026-11-20");
  assert.deepEqual([open.planned, open.due, open.open, open.notDue, open.compliancePct], [3, 1, 1, 1, 100]);
  const judged = complianceTally(rows, "2026-11-20", onDueDate);
  assert.deepEqual([judged.due, judged.open, judged.outstanding, judged.compliancePct], [2, 0, 1, 50]);
});

test("the windows are the organisation's: a completion is judged by the window in force", () => {
  const done = row({ status: "COMPLETED", completedDate: "2026-11-30" }); // 20 days late
  assert.equal(outcomeOf(done, "2026-12-01").outcome, "OUTSIDE_WINDOW");
  const wider = normaliseComplianceRule({ countFrom: "WINDOW_CLOSED", windows: { ...DEFAULT_COMPLIANCE_RULE.windows, QUARTERLY: 21 } });
  assert.equal(windowDaysFor(wider, " quarterly "), 21);
  assert.equal(outcomeOf(done, "2026-12-01", wider).outcome, "LATE");
  assert.equal(windowDaysFor(wider, "SOMETHING_ELSE"), 14);
});

test("a rule that is incomplete or out of range is refused, and a stored one is made safe", () => {
  assert.equal(validateComplianceRule(DEFAULT_COMPLIANCE_RULE), null);
  assert.match(validateComplianceRule({ ...DEFAULT_COMPLIANCE_RULE, countFrom: "NEVER" }) ?? "", /Choose when/);
  assert.match(validateComplianceRule({ countFrom: "DUE_DATE", windows: { ...DEFAULT_COMPLIANCE_RULE.windows, ANNUAL: 400 } }) ?? "", /annual/);
  assert.match(validateComplianceRule({ countFrom: "DUE_DATE", windows: { ...DEFAULT_COMPLIANCE_RULE.windows, WEEKLY: "" } }) ?? "", /weekly/);
  const safe = normaliseComplianceRule({ countFrom: "x", windows: { QUARTERLY: -3, ANNUAL: "45" } });
  assert.equal(safe.countFrom, "WINDOW_CLOSED");
  assert.equal(safe.windows.QUARTERLY, 14);
  assert.equal(safe.windows.ANNUAL, 45);
  assert.match(describeRule(safe), /annual 45 days/);
});

test("the rule is read by the Log, the KPI and the schedule header, and only the Super Admin changes it", () => {
  assert.match(readFileSync("src/lib/kpi/compute.ts", "utf8"), /complianceTally\(rows as unknown as LogActivity\[\], todayStr, rule\)/);
  const page = readFileSync("src/app/schedule/page.tsx", "utf8");
  assert.match(page, /\/api\/settings\/compliance-rule/);
  assert.match(page, /complianceTally\(pm, TODAY, rule\)/);
  const route = readFileSync("src/app/api/settings/compliance-rule/route.ts", "utf8");
  assert.match(route, /export async function PUT[\s\S]*requireRoles\(SETTINGS_WRITE_ROLES\)/);
  const store = readFileSync("src/lib/maintenance/compliance-rule-store.ts", "utf8");
  assert.match(store, /entityType: "compliance_rule"/);
  assert.match(readFileSync("src/app/settings/page.tsx", "utf8"), /<ComplianceRuleSettings \/>/);
});

test("two open visits closer than half the interval are the same round entered twice", () => {
  assert.equal(tooCloseTo("2026-11-19", ["2026-11-20"], "BI_MONTHLY"), "2026-11-20");
  assert.equal(tooCloseTo("2026-11-30", ["2026-11-20"], "BI_MONTHLY"), "2026-11-20");
  assert.equal(tooCloseTo("2027-01-20", ["2026-11-20"], "BI_MONTHLY"), null);
  assert.equal(tooCloseTo("2026-11-19", ["2026-11-20"], null), null);
  assert.equal(tooCloseTo("2026-11-19", [], "QUARTERLY"), null);
});

test("recurrence adds nothing while the series already has a visit to come", () => {
  const src = readFileSync("src/lib/schedule.ts", "utf8");
  assert.match(src, /ne\(maintenanceSchedule\.status, "COMPLETED"\),\s+gte\(maintenanceSchedule\.plannedDate, today\)/);
  assert.match(src, /if \(ahead\.length\) return null;/);
  assert.match(readFileSync("src/app/api/schedule/route.ts", "utf8"), /tooCloseTo\(plannedDate/);
});
