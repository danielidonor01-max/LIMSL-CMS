// src/lib/equipment-status.ts
// ONE writer for equipment.status. The status a machine shows is a CONSEQUENCE
// of its open work, corrective faults and in-progress preventive jobs, not a
// field each flow flips on its own. Previously three routes set it directly and
// could disagree (closing one of two open faults returned a still-broken
// machine to service). Every one of those flows now calls applyDerivedStatus()
// after its own write, so the register can never contradict the records.
//
// DECOMMISSIONED and AWAITING_PARTS are sticky MANUAL states: they describe a
// decision no record implies (an asset retired, a machine waiting on a delivery)
// so derivation never overrides them, only an explicit edit on the equipment
// record can move a machine out of them.
import { db } from "@/lib/db";
import { correctiveMaintenance, equipment, workOrders } from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";

export const STICKY_MANUAL_STATUSES = ["DECOMMISSIONED", "AWAITING_PARTS"] as const;

// The decision itself, free of the database so it can be exercised directly.
// currentStatus is what the register holds now; openCmUrgencies are the
// urgencies of every non-closed corrective record on the machine.
export function decideStatus(
  currentStatus: string,
  openCmUrgencies: string[],
  hasActiveWorkOrder: boolean,
): string {
  if ((STICKY_MANUAL_STATUSES as readonly string[]).includes(currentStatus)) return currentStatus;
  if (openCmUrgencies.length > 0) {
    const severe = openCmUrgencies.some((u) => u === "CRITICAL" || u === "HIGH");
    return severe ? "BROKEN_DOWN" : "UNDER_MAINTENANCE";
  }
  if (hasActiveWorkOrder) return "UNDER_MAINTENANCE";
  return "OPERATIONAL";
}

export async function deriveEquipmentStatus(equipmentId: string): Promise<string | null> {
  const [eqRow] = await db
    .select({ status: equipment.status })
    .from(equipment)
    .where(eq(equipment.id, equipmentId))
    .limit(1);
  if (!eqRow) return null;
  if ((STICKY_MANUAL_STATUSES as readonly string[]).includes(eqRow.status)) return eqRow.status;

  const openCms = await db
    .select({ urgency: correctiveMaintenance.urgency })
    .from(correctiveMaintenance)
    .where(and(eq(correctiveMaintenance.equipmentId, equipmentId), ne(correctiveMaintenance.status, "CLOSED")));

  const [activeWo] = openCms.length > 0
    ? [undefined]
    : await db
        .select({ id: workOrders.id })
        .from(workOrders)
        .where(and(eq(workOrders.equipmentId, equipmentId), eq(workOrders.status, "IN_PROGRESS")))
        .limit(1);

  return decideStatus(eqRow.status, openCms.map((c) => c.urgency ?? ""), !!activeWo);
}

// Compute and persist. Best-effort at call sites: a derivation failure must
// never fail the maintenance action that triggered it.
export async function applyDerivedStatus(equipmentId: string): Promise<string | null> {
  const next = await deriveEquipmentStatus(equipmentId);
  if (!next) return null;
  await db
    .update(equipment)
    .set({ status: next, updatedAt: new Date().toISOString() })
    .where(eq(equipment.id, equipmentId));
  return next;
}
