import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mayRequestWorkDate, validateWorkDateRequest, type WorkDateRow } from "@/lib/maintenance/work-date";
import { CHAINS, canSignChainStep } from "@/lib/signoff/chains";
import { WORK_ASSIGN_ROLES } from "@/lib/roles";
import { outcomeOf } from "@/lib/maintenance/compliance-log";

const TODAY = "2026-11-20";
const rows: WorkDateRow[] = [
  { id: "a", status: "COMPLETED", plannedDate: "2026-01-26", completedDate: "2026-11-20T10:00:00Z" },
  { id: "b", status: "COMPLETED", plannedDate: "2026-01-26", completedDate: "2026-11-20" },
];
const ok = { workDate: "2026-01-26", evidence: "Equipment History Log, entry of 26 Jan 2026", reason: "Done on paper, entered in November", rows, today: TODAY };

test("a correction needs a real past date, its evidence and its reason", () => {
  assert.equal(validateWorkDateRequest(ok), null);
  assert.match(validateWorkDateRequest({ ...ok, workDate: "" }) ?? "", /date the work was done/);
  assert.match(validateWorkDateRequest({ ...ok, workDate: "2026-11-21" }) ?? "", /future/);
  assert.match(validateWorkDateRequest({ ...ok, evidence: " " }) ?? "", /evidence/);
  assert.match(validateWorkDateRequest({ ...ok, reason: "x" }) ?? "", /why/);
  assert.match(validateWorkDateRequest({ ...ok, rows: [] }) ?? "", /no completed work/);
  assert.match(validateWorkDateRequest({ ...ok, rows: [{ ...rows[0], status: "OVERDUE" }] }) ?? "", /Only completed/);
  assert.match(validateWorkDateRequest({ ...ok, workDate: "2026-11-20" }) ?? "", /already recorded/);
});

test("the Foreman or a manager asks; the Maintenance Manager approves and may not ask", () => {
  assert.equal(mayRequestWorkDate("FOREMAN", WORK_ASSIGN_ROLES), null);
  assert.equal(mayRequestWorkDate("FACTORY_MANAGER", WORK_ASSIGN_ROLES), null);
  assert.match(mayRequestWorkDate("MAINTENANCE_MANAGER", WORK_ASSIGN_ROLES) ?? "", /approves/);
  assert.match(mayRequestWorkDate("TECHNICIAN", WORK_ASSIGN_ROLES) ?? "", /Foreman or a manager/);
});

test("only the Maintenance Manager can sign a work date correction, with no stand-in", () => {
  assert.equal(CHAINS.WORK_DATE.length, 1);
  const step = { stepOrder: 1, role: CHAINS.WORK_DATE[0].role };
  assert.equal(canSignChainStep("MAINTENANCE_MANAGER", "WORK_DATE", step), true);
  for (const role of ["SUPER_ADMIN", "FACTORY_MANAGER", "COO", "FOREMAN"]) {
    assert.equal(canSignChainStep(role, "WORK_DATE", step), false, role);
  }
});

test("the signature applies the correction, keeps the recorded date and audits the change", () => {
  const route = readFileSync("src/app/api/signoffs/[id]/route.ts", "utf8");
  assert.match(route, /if \(step\.entityType === WORK_DATE_ENTITY\) \{\s+await applyWorkDateCorrection/);
  const apply = readFileSync("src/lib/maintenance/work-date-db.ts", "utf8");
  assert.match(apply, /c\.status !== "PENDING_APPROVAL"\) return 0/);
  assert.match(apply, /recordedDate: r\.recordedDate \?\?/);
  assert.match(apply, /completedDate: c\.workDate/);
  assert.match(apply, /entityType: "work_date_correction"/);
  const post = readFileSync("src/app/api/work-date-corrections/route.ts", "utf8");
  assert.doesNotMatch(post, /update\(maintenanceSchedule\)/);
  assert.match(post, /ensureSignoffChain\(WORK_DATE_ENTITY, id, correctionNumber\)/);
});

test("compliance follows the work date once it is corrected", () => {
  const row = {
    id: "a",
    plannedDate: "2026-01-26",
    activityType: "PM",
    status: "COMPLETED",
    maintenanceFrequency: "QUARTERLY",
    category: "CNC_HEAVY",
    equipmentName: "M",
    assetId: "A",
  };
  assert.equal(outcomeOf({ ...row, completedDate: "2026-11-20" }, TODAY).outcome, "OUTSIDE_WINDOW");
  assert.equal(outcomeOf({ ...row, completedDate: "2026-01-26", recordedDate: "2026-11-20" }, TODAY).outcome, "ON_TIME");
});
