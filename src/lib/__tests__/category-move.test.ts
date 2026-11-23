import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planCategoryMove, validateMoveRequest, type MoveCandidate } from "@/lib/maintenance/category-move";
import { EQUIPMENT_MOVE_ROLES, MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

const m = (over: Partial<MoveCandidate> = {}): MoveCandidate => ({
  id: "a",
  name: "Universal Lathe Machine",
  category: "CNC_LIGHT",
  status: "OPERATIONAL",
  removedAt: null,
  ...over,
});

test("a move needs machines and a target", () => {
  assert.equal(validateMoveRequest({ equipmentIds: ["a"], toCategory: "PRESS_ROLL_SHEAR" }), null);
  assert.match(validateMoveRequest({ equipmentIds: [], toCategory: "X" }) ?? "", /at least one/);
  assert.match(validateMoveRequest({ equipmentIds: ["a"], toCategory: " " }) ?? "", /category/);
  assert.match(validateMoveRequest({ equipmentIds: ["a", 3], toCategory: "X" }) ?? "", /not valid/);
});

test("one or many move; the ones that cannot are named with the reason", () => {
  const { movable, refused } = planCategoryMove(
    [
      m({ id: "a" }),
      m({ id: "b", category: "PRESS_ROLL_SHEAR" }),
      m({ id: "c", status: "DECOMMISSIONED" }),
      m({ id: "d", removedAt: "2026-11-17" }),
      m({ id: "e" }),
      m({ id: "f" }),
    ],
    "PRESS_ROLL_SHEAR",
    new Set(["e"]),
  );
  assert.deepEqual(movable.map((x) => x.id), ["a", "f"]);
  assert.deepEqual(
    refused.map((r) => [r.id, r.why.split(".")[0]]),
    [
      ["b", "It is already in that category"],
      ["c", "It is decommissioned"],
      ["d", "It has been removed from the register"],
      ["e", "It is on a PM batch that is still open"],
    ],
  );
});

test("the managers who own the regime move machines; a technician and QA/QC do not", () => {
  assert.deepEqual(EQUIPMENT_MOVE_ROLES, ["SUPER_ADMIN", "FACTORY_MANAGER", "MAINTENANCE_MANAGER"]);
  for (const r of EQUIPMENT_MOVE_ROLES) assert.ok(MAINTENANCE_WRITE_ROLES.includes(r), r);
  const route = readFileSync("src/app/api/asset-categories/move/route.ts", "utf8");
  assert.match(route, /requireRoles\(EQUIPMENT_MOVE_ROLES\)/);
});

test("a moved machine takes the category's interval, is replanned and is on the record", () => {
  const route = readFileSync("src/app/api/asset-categories/move/route.ts", "utf8");
  assert.match(route, /set\(\{ category: toCode, maintenanceFrequency: target\.maintenanceFrequency/);
  assert.match(route, /replanMachine\(/);
  assert.match(route, /logEquipmentEvent\(/);
  assert.match(route, /insert\(auditLog\)/);
  // A single machine edited in the register is replanned on a category change too.
  const single = readFileSync("src/app/api/equipment/[assetId]/route.ts", "utf8");
  assert.match(single, /nowFrequency !== before\.maintenanceFrequency \|\| nowCategory !== before\.category/);
});

test("the Log says its figures count visits of one kind of work", () => {
  const src = readFileSync("src/components/ScheduleComplianceLog.tsx", "utf8");
  assert.match(src, /one for each machine on each planned date\. Inspections are not included/);
  // On screen, on the printed record, and handed from one to the other.
  assert.equal(src.match(/\{countNote\}/g)?.length, 3);
});
