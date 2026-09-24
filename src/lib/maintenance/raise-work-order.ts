// src/lib/maintenance/raise-work-order.ts
// Bringing a work order into being, in one place.
//
// A work order is the authorisation to do the job, so the things that happen
// as it is created are not incidental: it draws a race-safe number, it pins
// the procedure revision that governs it, it decides whether work may start
// now or must wait for signatures, and it opens the approval chain. Getting
// any of those wrong produces a job that looks authorised and is not.
//
// Three callers now raise work orders — the work order form, a PM batch
// fanning out across its machines, and a technician picking up a reported
// fault. They must agree on all of the above, so it lives here rather than
// being typed out a second and third time.
import { db } from "@/lib/db";
import { workOrders, equipment, maintenanceSchedule, auditLog, procedureRevisions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { nextDocNumber } from "@/lib/doc-number";
import { suggestedWoPriority } from "@/lib/maintenance/adherence";
import { ensureSignoffChain } from "@/lib/signoff/service";
import { WO_APPROVAL_ENTITY } from "@/lib/work-order-approval";
import { commencementFor } from "@/lib/maintenance/work-order-commencement";
import { governingProcedure } from "@/lib/maintenance/governing-procedure";

export type RaiseWorkOrderInput = {
  type: string;
  equipmentId: string;
  title: string;
  description?: string | null;
  plannedDate?: string | null;
  scheduleId?: string | null;
  /** Set when this work order is one machine inside a PM batch. */
  batchId?: string | null;
  /** Set when this work order answers a reported fault. */
  cmsId?: string | null;
  technicianId?: string | null;
  technicianName?: string | null;
  priority?: string | null;
  actor: { id?: string | null; name?: string | null; role?: string | null };
  /** Added to the audit line, so the record says what caused the job to exist. */
  origin?: string;
};

export type RaisedWorkOrder = {
  id: string;
  workOrderNumber: string;
  status: string;
  equipmentId: string;
  title: string;
  retrospective: boolean;
};

export async function raiseWorkOrder(input: RaiseWorkOrderInput): Promise<RaisedWorkOrder> {
  const id = nanoid();
  const workOrderNumber = await nextDocNumber("WO");

  const [eqRow] = await db
    .select({ criticality: equipment.criticality })
    .from(equipment)
    .where(eq(equipment.id, input.equipmentId))
    .limit(1);

  const commencement = commencementFor(input.type);

  // Which revision of the maintenance procedure governs this job, decided now
  // and never again. Reading it back at display time would make every closed
  // job silently re-attribute itself to whatever revision is current.
  const governing = governingProcedure(
    await db
      .select({
        id: procedureRevisions.id,
        code: procedureRevisions.code,
        revision: procedureRevisions.revision,
        status: procedureRevisions.status,
        effectiveDate: procedureRevisions.effectiveDate,
      })
      .from(procedureRevisions),
    input.plannedDate || new Date().toISOString().slice(0, 10),
  );

  const row = {
    id,
    workOrderNumber,
    type: input.type,
    equipmentId: input.equipmentId,
    scheduleId: input.scheduleId || null,
    batchId: input.batchId || null,
    cmsId: input.cmsId || null,
    priority: input.priority || suggestedWoPriority(eqRow?.criticality),
    status: commencement.status,
    approvalRetrospective: commencement.retrospective,
    title: input.title,
    description: input.description || "",
    plannedDate: input.plannedDate || null,
    technicianId: input.technicianId || null,
    technicianName: input.technicianName || null,
    procedureRevisionId: governing?.id ?? null,
    procedureCode: governing?.code ?? null,
    procedureRevision: governing?.revision ?? null,
    createdBy: input.actor.id ?? null,
  };

  await db.insert(workOrders).values(row);

  if (input.scheduleId) {
    await db
      .update(maintenanceSchedule)
      .set({ workOrderId: id })
      .where(eq(maintenanceSchedule.id, input.scheduleId));
  }

  await ensureSignoffChain(WO_APPROVAL_ENTITY, id, workOrderNumber);

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: input.actor.id ?? null,
    userName: input.actor.name || "System",
    action: "CREATE",
    entityType: "work_order",
    entityId: id,
    entityDescription:
      `${workOrderNumber}, ${input.title}` +
      (input.origin ? `, ${input.origin}` : "") +
      (commencement.retrospective ? ", EMERGENCY commenced before approval" : ", raised for approval"),
  });

  return {
    id,
    workOrderNumber,
    status: commencement.status,
    equipmentId: input.equipmentId,
    title: input.title,
    retrospective: commencement.retrospective,
  };
}
