// src/lib/maintenance/report-breakdown.ts
// Recording a breakdown. One function, so a fault reported from the form and
// one raised at the end of a troubleshooting session are numbered, change the
// machine's status and alert management in exactly the same way.
import { db } from "@/lib/db";
import { correctiveMaintenance, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { BREAKDOWN_NOTIFY_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { applyDerivedStatus } from "@/lib/equipment-status";
import { notify } from "@/lib/notifications";

export type BreakdownInput = {
  equipmentId: string;
  faultDescription: string;
  urgency?: string | null;
  faultType?: string | null;
  /** When the fault happened, local "YYYY-MM-DDTHH:MM". */
  downStartAt?: string | null;
  reportedDate?: string | null;
  scheduled?: boolean;
  plannedDate?: string | null;
  breakdownId?: string | null;
  operatingStatusAtFailure?: string | null;
  observedFault?: string | null;
  errorCodes?: string | null;
  environmentalCondition?: string | null;
};

export async function reportBreakdown(input: BreakdownInput, actor: { id?: string | null; name?: string | null }) {
  const cmrfNumber = await nextDocNumber("CMRF");
  const record = {
    id: nanoid(),
    cmrfNumber,
    breakdownId: input.breakdownId || `BD-${nanoid(6).toUpperCase()}`,
    equipmentId: input.equipmentId,
    reportedById: actor.id ?? null,
    reportedByName: actor.name || "Unknown",
    reportedDate: input.reportedDate || new Date().toISOString().split("T")[0],
    downStartAt: input.downStartAt || null,
    faultType: input.faultType || "UNKNOWN",
    urgency: input.urgency || "MEDIUM",
    origin: input.scheduled ? "SCHEDULED" : "REPORTED",
    plannedDate: input.scheduled ? (input.plannedDate || null) : null,
    scheduledById: input.scheduled ? (actor.id ?? null) : null,
    scheduledByName: input.scheduled ? (actor.name ?? null) : null,
    faultDescription: input.faultDescription || "",
    operatingStatusAtFailure: input.operatingStatusAtFailure || "RUNNING",
    observedFault: input.observedFault || "",
    errorCodes: input.errorCodes || "",
    environmentalCondition: input.environmentalCondition || "",
    status: "OPEN",
  };

  await db.insert(correctiveMaintenance).values(record);

  // Status is DERIVED from the machine's open work, never flipped here, see
  // lib/equipment-status.ts (the single writer). Best-effort: a derivation
  // failure must not fail the fault report.
  try {
    await applyDerivedStatus(input.equipmentId);
  } catch (err) {
    console.warn("report breakdown: status derivation failed (non-fatal)", err);
  }

  // Alert the maintenance leadership + HSE that a breakdown was logged.
  // Best-effort, never let a notification failure fail the record.
  try {
    const [eqRow] = await db.select().from(equipment).where(eq(equipment.id, input.equipmentId)).limit(1);
    const machine = eqRow ? eqRow.name || eqRow.assetId : "a machine";
    await notify({
      event: "BREAKDOWN",
      title: `Breakdown logged: ${machine}`,
      body: `${record.cmrfNumber} (${record.urgency}), ${record.faultDescription || "fault reported"}. Reported by ${record.reportedByName}.`,
      linkPath: `/corrective/${record.id}`,
      relatedEntityType: "corrective_maintenance",
      relatedEntityId: record.id,
      roles: BREAKDOWN_NOTIFY_ROLES,
    });
  } catch (err) {
    console.warn("report breakdown: notify failed", err);
  }

  return record;
}
