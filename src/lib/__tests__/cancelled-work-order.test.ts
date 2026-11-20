import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDeadWorkOrderChain, isWaitingForWorkOrder } from "@/lib/signoff/finished";
import { cmFlowState } from "@/lib/maintenance/flow";
import { buildQuarterLog, quarterStanding, sumTallies, type LogActivity } from "@/lib/maintenance/compliance-log";

test("a cancelled work order's approval steps wait on nobody", () => {
  assert.equal(isDeadWorkOrderChain("WORK_ORDER", "CANCELLED"), true);
  assert.equal(isDeadWorkOrderChain("WORK_ORDER", "PENDING_APPROVAL"), false);
  assert.equal(isDeadWorkOrderChain("PM_BATCH", "CANCELLED"), false);
  assert.equal(isDeadWorkOrderChain("WORK_ORDER", undefined), false);
});

test("a breakdown with no work order asks nobody to sign it off", () => {
  assert.equal(isWaitingForWorkOrder("CORRECTIVE", { workOrderId: null, status: "IN_PROGRESS" }), true);
  assert.equal(isWaitingForWorkOrder("CORRECTIVE", { workOrderId: "wo1", status: "IN_PROGRESS" }), false);
  assert.equal(isWaitingForWorkOrder("CORRECTIVE", { workOrderId: null, status: "CLOSED" }), false);
  assert.equal(isWaitingForWorkOrder("WMS", { workOrderId: null, status: "DRAFT" }), false);
  assert.equal(isWaitingForWorkOrder("CORRECTIVE", undefined), false);
});

test("cancelling a work order frees its breakdown and removes its unsigned steps", () => {
  const route = readFileSync("src/app/api/work-orders/[id]/route.ts", "utf8");
  assert.match(route, /eq\(signoffs\.entityType, "WORK_ORDER"\), eq\(signoffs\.entityId, id\), eq\(signoffs\.status, "PENDING"\)/);
  assert.match(route, /set\(\{ workOrderId: null, updatedAt: [^}]+\}\)\s*\.where\(eq\(correctiveMaintenance\.workOrderId, id\)\)/);
  const flow = readFileSync("src/app/api/corrective/[id]/flow/route.ts", "utf8");
  assert.match(flow, /w\.status !== "CANCELLED"/);
});

test("a repair whose only work order was cancelled is back on raising one", () => {
  const facts = { origin: "REPORTED", motionedAt: "2026-11-18", assignedToId: "u1" };
  assert.equal(cmFlowState({ ...facts, workOrderCount: 1 }).current?.key, "WMS");
  assert.equal(cmFlowState({ ...facts, workOrderCount: 0 }).current?.key, "WORK_ORDER");
});

test("the printed record is the year: quarters in turn, then the comparison, and no machine list", () => {
  const src = readFileSync("src/components/ScheduleComplianceLog.tsx", "utf8");
  assert.match(src, /<YearPrint logs=\{year4\}/);
  assert.match(src, /<div className="screen-only space-y-6">/);
  assert.match(src, /breakBefore: "page"/);
  const print = src.slice(src.indexOf("function YearPrint"));
  assert.doesNotMatch(print, /equipmentName|entries\.map/);
  assert.match(print, /Still to come/);
});

test("quarters are closed, current or ahead, and the year adds up", () => {
  assert.equal(quarterStanding(2026, 3, "2026-11-20"), "CLOSED");
  assert.equal(quarterStanding(2026, 4, "2026-11-20"), "CURRENT");
  assert.equal(quarterStanding(2027, 1, "2026-11-20"), "AHEAD");
  const row = (over: Partial<LogActivity>): LogActivity => ({
    id: Math.random().toString(36),
    plannedDate: "2026-02-10",
    activityType: "PM",
    status: "COMPLETED",
    completedDate: "2026-02-10",
    maintenanceFrequency: "QUARTERLY",
    category: "WELDING",
    equipmentName: "W",
    assetId: "A",
    ...over,
  });
  const rows = [
    row({}),
    row({ status: "OVERDUE", completedDate: null }),
    row({ plannedDate: "2026-10-05", completedDate: "2026-10-05" }),
    row({ plannedDate: "2026-12-10", status: "SCHEDULED", completedDate: null }),
  ];
  const year = [1, 2, 3, 4].map((q) => buildQuarterLog(rows, { year: 2026, quarter: q, activityType: "PM", today: "2026-11-20" }));
  const ytd = sumTallies(year.map((l) => l.total));
  assert.deepEqual([ytd.planned, ytd.due, ytd.compliant, ytd.notDue, ytd.compliancePct], [4, 3, 2, 1, 66]);
});

test("the earthing lead gives its dark panel room for words and dates", () => {
  assert.match(readFileSync("src/components/PageLead.tsx", "utf8"), /wideFigure \? "lg:w-\[26rem\]" : "lg:w-72"/);
  assert.match(readFileSync("src/app/earthing/page.tsx", "utf8"), /\n\s+wideFigure\n/);
});
