// src/lib/maintenance/asset-categories.ts
// The category is where a machine's maintenance interval lives.
//
// CNC light-duty machines are serviced quarterly because they are CNC
// light-duty machines, not because somebody chose "quarterly" on each of them.
// Recording the interval per machine meant two identical lathes could drift
// onto different regimes, and nothing said which one was right. So the interval
// is set once on the category and every machine in it inherits it.
//
// That makes changing it a change to the maintenance regime of every machine in
// the category at once, and the plan with it. So a change is proposed, signed
// by the Maintenance Manager and the QA/QC Supervisor, and only then applied —
// in one step, with the before and after kept on the change record.
import { db } from "@/lib/db";
import {
  assetCategories,
  assetCategoryChanges,
  equipment,
  maintenanceSchedule,
  auditLog,
} from "@/lib/db/schema";
import { and, eq, gt, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";
import { FREQUENCY_MONTHS } from "./plan-generation";
import { syncPlanForEquipment } from "./plan-sync";

export type Category = typeof assetCategories.$inferSelect;

export const FREQUENCIES = Object.keys(FREQUENCY_MONTHS);

/** A category code from a name: "Excavation Devices" -> EXCAVATION_DEVICES. */
export function categoryCodeFrom(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export async function listCategories(): Promise<Category[]> {
  return db.select().from(assetCategories);
}

export async function getCategory(code: string | null | undefined): Promise<Category | null> {
  if (!code) return null;
  const [row] = await db.select().from(assetCategories).where(eq(assetCategories.code, code)).limit(1);
  return row ?? null;
}

/**
 * Labels for every category, the register's own over the built-in names. The
 * built-ins stay as a fallback so a screen never shows a raw code for a
 * category that predates the table.
 */
export async function categoryLabelMap(): Promise<Record<string, string>> {
  const rows = await listCategories();
  const map: Record<string, string> = { ...EQUIPMENT_CATEGORY_LABELS };
  for (const r of rows) map[r.code] = r.label;
  return map;
}

// ─── Replanning ─────────────────────────────────────────────────────────────

type PlanRow = {
  plannedDate: string;
  status: string;
  workOrderId?: string | null;
  batchId?: string | null;
  deferredAt?: string | null;
};

/**
 * Whether a plan row may be replaced when a machine's interval changes.
 *
 * Only a future activity nobody has touched: still SCHEDULED, no work order
 * raised against it, not in a batch, not deferred. Everything else is a
 * decision somebody made — an overdue job that still has to be done, a job
 * rescheduled to suit the shop floor, a job already under way — and replacing
 * it would erase that decision without anybody being told.
 */
export function isReplannable(row: PlanRow, today: string): boolean {
  return (
    row.status === "SCHEDULED" &&
    !row.workOrderId &&
    !row.batchId &&
    !row.deferredAt &&
    row.plannedDate.slice(0, 10) > today.slice(0, 10)
  );
}

/**
 * Bring one machine's plan into line with its (new) interval: drop the future
 * rows nobody has touched, then add the dates the new interval asks for.
 */
export async function replanMachine(
  machine: typeof equipment.$inferSelect,
  actor?: { id?: string | null; name?: string | null },
): Promise<{ removed: number; added: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const future = await db
    .select({
      id: maintenanceSchedule.id,
      plannedDate: maintenanceSchedule.plannedDate,
      status: maintenanceSchedule.status,
      workOrderId: maintenanceSchedule.workOrderId,
      batchId: maintenanceSchedule.batchId,
      deferredAt: maintenanceSchedule.deferredAt,
    })
    .from(maintenanceSchedule)
    .where(and(eq(maintenanceSchedule.equipmentId, machine.id), gt(maintenanceSchedule.plannedDate, today)));

  const doomed = future.filter((r) => isReplannable(r, today)).map((r) => r.id);
  if (doomed.length) {
    await db.delete(maintenanceSchedule).where(inArray(maintenanceSchedule.id, doomed));
  }

  if (machine.status === "DECOMMISSIONED") return { removed: doomed.length, added: 0 };

  const synced = await syncPlanForEquipment(machine, { actor, notBefore: today });
  return { removed: doomed.length, added: synced.added };
}

// ─── Applying an approved change ────────────────────────────────────────────

export async function applyCategoryChange(
  changeId: string,
  actor?: { id?: string | null; name?: string | null },
): Promise<{ applied: boolean; machines: number; replaced: number }> {
  const [change] = await db
    .select()
    .from(assetCategoryChanges)
    .where(eq(assetCategoryChanges.id, changeId))
    .limit(1);
  // Applied exactly once. A second completion signal — a re-sign, a retry —
  // must not replan the category a second time.
  if (!change || change.status !== "PENDING_APPROVAL") return { applied: false, machines: 0, replaced: 0 };

  const now = new Date().toISOString();
  const existing = await getCategory(change.categoryCode);
  if (existing) {
    await db
      .update(assetCategories)
      .set({
        label: change.proposedLabel,
        maintenanceFrequency: change.proposedFrequency,
        updatedAt: now,
      })
      .where(eq(assetCategories.code, change.categoryCode));
  } else {
    await db.insert(assetCategories).values({
      code: change.categoryCode,
      label: change.proposedLabel,
      maintenanceFrequency: change.proposedFrequency,
    });
  }

  // Every machine in the category takes the category's interval — that is the
  // whole point — and its plan follows.
  const machines = await db.select().from(equipment).where(eq(equipment.category, change.categoryCode));
  const frequencyChanged = !existing || existing.maintenanceFrequency !== change.proposedFrequency;

  let replaced = 0;
  if (machines.length) {
    await db
      .update(equipment)
      .set({ maintenanceFrequency: change.proposedFrequency })
      .where(eq(equipment.category, change.categoryCode));

    if (frequencyChanged) {
      for (const m of machines) {
        const r = await replanMachine({ ...m, maintenanceFrequency: change.proposedFrequency }, actor);
        replaced += r.removed;
      }
    }
  }

  await db
    .update(assetCategoryChanges)
    .set({ status: "APPLIED", appliedAt: now, machinesAffected: machines.length, planRowsReplaced: replaced })
    .where(eq(assetCategoryChanges.id, change.id));

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: actor?.id ?? null,
    userName: actor?.name || "System",
    action: "UPDATE",
    entityType: "asset_category",
    entityId: change.categoryCode,
    entityDescription:
      `${change.changeNumber} applied: ${change.proposedLabel} ` +
      (change.kind === "CREATE"
        ? `added, serviced ${change.proposedFrequency.toLowerCase().replace(/_/g, " ")}`
        : `${change.previousFrequency !== change.proposedFrequency ? `interval ${String(change.previousFrequency).toLowerCase().replace(/_/g, " ")} -> ${change.proposedFrequency.toLowerCase().replace(/_/g, " ")}` : "renamed"}`) +
      `, ${machines.length} machine${machines.length === 1 ? "" : "s"}, ${replaced} future plan row${replaced === 1 ? "" : "s"} replaced`,
  });

  return { applied: true, machines: machines.length, replaced };
}

/** The pending change for a category, if one is waiting for signatures. */
export async function pendingChangeFor(code: string) {
  const [row] = await db
    .select()
    .from(assetCategoryChanges)
    .where(and(eq(assetCategoryChanges.categoryCode, code), eq(assetCategoryChanges.status, "PENDING_APPROVAL")))
    .limit(1);
  return row ?? null;
}

