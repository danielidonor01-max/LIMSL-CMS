// src/lib/maintenance/cm-closeout.ts
// What a breakdown record needs before it can be signed off, and the close-out
// itself (LIMSL, 17 Nov 2026).
//
// The record used to have three saves (the RCA, the dates, the close) and a
// close button that asked for two drawn signatures the page no longer
// collected, so it could never succeed. Now:
//
//   fill in and Save  →  sign the chain  →  the last signature closes it
//
// The technician's "Repaired by" signature is refused until the record is
// complete (`closeOutGaps`), so everyone after him signs a finished record.
// The chain's last required signature (the Maintenance Manager's) closes the
// record (`closeCorrective`). There is no separate close button.
import { db } from "@/lib/db";
import { correctiveMaintenance, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { permitWasIssued } from "@/lib/maintenance/work-readiness-db";
import { getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";
import { getWorkSettings } from "@/lib/settings";
import { productionDowntimeHours } from "@/lib/worktime";
import { logEquipmentEvent } from "@/lib/equipment-log";
import { applyDerivedStatus } from "@/lib/equipment-status";

import { closeOutGaps, listOf } from "@/lib/maintenance/cm-closeout-rules";
export { closeOutGaps, listOf } from "@/lib/maintenance/cm-closeout-rules";

/**
 * Why the first signature on a breakdown record may not be taken yet, or null.
 * The record must be complete and saved, and the repair must have run under a
 * work order and an issued permit.
 */
export async function correctiveSignBlocker(recordId: string): Promise<string | null> {
  const [record] = await db
    .select()
    .from(correctiveMaintenance)
    .where(eq(correctiveMaintenance.id, recordId))
    .limit(1);
  if (!record) return "This breakdown record no longer exists.";
  if (!record.workOrderId) return "No work order was raised for this repair, so it cannot be signed off.";
  if (!(await permitWasIssued(record.workOrderId))) {
    return "No permit was issued for this repair, so it cannot be signed off.";
  }
  const gaps = closeOutGaps(record);
  if (gaps.length > 0) {
    return `Fill in and save ${listOf(gaps)} on the record before signing it.`;
  }
  return null;
}

/**
 * Close the record once its chain is complete. Idempotent: a closed record is
 * left alone. Names on the record come from the signed chain, never from text.
 */
export async function closeCorrective(
  recordId: string,
  actor: { id?: string | null; name?: string | null },
): Promise<{ closed: boolean; reason?: string }> {
  const [record] = await db
    .select()
    .from(correctiveMaintenance)
    .where(eq(correctiveMaintenance.id, recordId))
    .limit(1);
  if (!record) return { closed: false, reason: "not found" };
  if (record.status === "CLOSED") return { closed: false, reason: "already closed" };

  const chain = await getSignoffChain("CORRECTIVE", record.id);
  if (!chainSummary(chain).complete) return { closed: false, reason: "chain incomplete" };
  const blocker = await correctiveSignBlocker(record.id);
  if (blocker) return { closed: false, reason: blocker };

  const techStep = chain.find((s) => s.role === "TECHNICIAN" && s.status === "SIGNED");
  const supStep = chain.find((s) => s.role === "FOREMAN" && s.status === "SIGNED");
  const settings = await getWorkSettings();
  const totalDowntimeHours = productionDowntimeHours(record.downStartAt!, record.downEndAt!, settings);
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  await db
    .update(correctiveMaintenance)
    .set({
      status: "CLOSED",
      closeOutDate: today,
      restoredToServiceTime: record.restoredToServiceTime ?? record.downEndAt,
      totalDowntimeHours,
      technicianName: techStep?.signedByName ?? record.technicianName,
      technicianId: techStep?.signedById ?? record.technicianId,
      supervisorName: supStep?.signedByName ?? record.supervisorName,
      supervisorId: supStep?.signedById ?? record.supervisorId,
      updatedAt: now,
    })
    .where(eq(correctiveMaintenance.id, record.id));

  if (record.equipmentId) {
    await db
      .update(equipment)
      .set({ lastMaintenanceDate: today, updatedAt: now })
      .where(eq(equipment.id, record.equipmentId));
    try {
      await logEquipmentEvent({
        equipmentId: record.equipmentId,
        category: "CM",
        title: `Corrective maintenance closed, ${record.cmrfNumber}`,
        detail: `${record.faultDescription || record.observedFault || "Fault"}${record.verifiedRootCause ? ` · Root cause: ${record.verifiedRootCause}` : ""} · ${totalDowntimeHours}h downtime`,
        refType: "corrective_maintenance",
        refId: record.id,
        href: `/corrective/${record.id}`,
        source: "AUTO",
        performedById: actor.id ?? null,
        performedByName: actor.name ?? null,
        occurredAt: now,
      });
    } catch (err) {
      console.warn("cm-closeout: equipment log failed (non-fatal)", err);
    }
    try {
      await applyDerivedStatus(record.equipmentId);
    } catch (err) {
      console.warn("cm-closeout: status derivation failed (non-fatal)", err);
    }
  }
  return { closed: true };
}
