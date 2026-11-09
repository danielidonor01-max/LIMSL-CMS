// src/lib/maintenance/pm-batch.ts
// Raising a PM batch and putting a person on it — the two acts, in one place.
//
// They used to live inside their API routes, which was fine while the batch
// page was the only place either happened. Assigning a category on the
// schedule now raises its batch as well (LIMSL, November 2026): a name against
// a plan row with no batch behind it is a job with no method statement, no
// hazard analysis and no permit to hang off, so nothing could ever start.
// Both routes and the schedule call these, so "raised" and "assigned" mean the
// same thing wherever they happen.
//
// Raising a batch does not let anybody start work. The work orders it fans out
// still need the batch's WMS, JHA and permit approved before readinessToWork()
// lets anyone clock on (work-readiness.ts) — no document, no work.
import { db } from "@/lib/db";
import { pmBatches, maintenanceSchedule, equipment, workOrders, users, auditLog } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { nextDocNumber } from "@/lib/doc-number";
import { notify } from "@/lib/notifications";
import { raiseWorkOrder } from "./raise-work-order";
import { categoryLabelMap } from "./asset-categories";

type Actor = { id?: string | null; name?: string | null; role?: string | null };

export type RaisedBatch = {
  id: string;
  batchNumber: string;
  title: string;
  machineCount: number;
  workOrders: Array<{ id: string; workOrderNumber: string; equipmentId: string }>;
};

export type Failure = { ok: false; status: number; error: string };

export async function raisePmBatch(input: {
  category: string;
  plannedDate: string;
  actor: Actor;
}): Promise<({ ok: true } & RaisedBatch) | Failure> {
  const { category, plannedDate, actor } = input;

  // The machines in the batch are whatever the plan says is due that day for
  // that category and has not already been rolled into a batch. Read from the
  // plan rather than taken from the request, so a stale screen cannot quietly
  // leave a machine out of the permit that is supposed to cover it.
  const due = await db
    .select({
      scheduleId: maintenanceSchedule.id,
      equipmentId: maintenanceSchedule.equipmentId,
      activityType: maintenanceSchedule.activityType,
      taskDescription: maintenanceSchedule.taskDescription,
      status: maintenanceSchedule.status,
      assetId: equipment.assetId,
      name: equipment.name,
    })
    .from(maintenanceSchedule)
    .innerJoin(equipment, eq(maintenanceSchedule.equipmentId, equipment.id))
    .where(
      and(
        eq(maintenanceSchedule.plannedDate, plannedDate),
        eq(equipment.category, category),
        isNull(maintenanceSchedule.batchId),
      ),
    );

  const machines = due.filter(
    (r) => r.status !== "COMPLETED" && r.status !== "CANCELLED" && (r.activityType === "PM" || r.activityType === "INS"),
  );
  if (machines.length === 0) {
    return {
      ok: false,
      status: 409,
      error: "Nothing is due for that category on that date, or it has already been rolled into a batch.",
    };
  }

  const categoryLabel = (await categoryLabelMap())[category] ?? category;
  const id = nanoid();
  const batchNumber = await nextDocNumber("PMB");
  const activityType = machines.every((m) => m.activityType === "INS") ? "INS" : "PM";
  const title = `${activityType === "INS" ? "Inspection" : "PM"}, ${categoryLabel}, ${plannedDate}`;

  await db.insert(pmBatches).values({
    id,
    batchNumber,
    title,
    category,
    plannedDate,
    year: Number(plannedDate.slice(0, 4)) || new Date().getFullYear(),
    activityType,
    status: "PLANNED",
    createdBy: actor.id ?? null,
  });

  // One work order per machine, all pointing at the batch.
  const raised: RaisedBatch["workOrders"] = [];
  for (const m of machines) {
    const wo = await raiseWorkOrder({
      type: activityType === "INS" ? "INSPECTION" : "PREVENTIVE",
      equipmentId: m.equipmentId,
      title: `${activityType === "INS" ? "Inspection" : "PM"}, ${m.assetId} ${m.name}`,
      description: m.taskDescription || `Planned ${activityType} under batch ${batchNumber}.`,
      plannedDate,
      scheduleId: m.scheduleId,
      batchId: id,
      actor,
      origin: `raised under PM batch ${batchNumber}`,
    });
    raised.push({ id: wo.id, workOrderNumber: wo.workOrderNumber, equipmentId: m.equipmentId });
    await db.update(maintenanceSchedule).set({ batchId: id }).where(eq(maintenanceSchedule.id, m.scheduleId));
  }

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: actor.id ?? null,
    userName: actor.name || "System",
    action: "CREATE",
    entityType: "pm_batch",
    entityId: id,
    entityDescription:
      `${batchNumber}, ${title}, ${machines.length} machine${machines.length === 1 ? "" : "s"}, ` +
      `work orders ${raised.map((r) => r.workOrderNumber).join(", ")}`,
  });

  return { ok: true, id, batchNumber, title, machineCount: machines.length, workOrders: raised };
}

export async function assignPmBatch(input: {
  batchId: string;
  assignedToId?: string | null;
  assistantIds?: string[];
  actor: Actor;
}): Promise<{ ok: true; assignedToName: string | null; workOrders: number } | Failure> {
  const { batchId, actor } = input;
  const [batch] = await db.select().from(pmBatches).where(eq(pmBatches.id, batchId)).limit(1);
  if (!batch) return { ok: false, status: 404, error: "PM batch not found" };

  let assignedToName: string | null = null;
  if (input.assignedToId) {
    const [person] = await db
      .select({ id: users.id, name: users.name, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, String(input.assignedToId)))
      .limit(1);
    if (!person) return { ok: false, status: 400, error: "That person was not found." };
    if (person.isActive === false) {
      return { ok: false, status: 409, error: `${person.name} is no longer an active account.` };
    }
    assignedToName = person.name;
  }

  const now = new Date().toISOString();
  await db
    .update(pmBatches)
    .set({
      assignedToId: input.assignedToId || null,
      assignedToName,
      assignedById: input.assignedToId ? (actor.id ?? null) : null,
      assignedByName: input.assignedToId ? (actor.name ?? null) : null,
      assignedAt: input.assignedToId ? now : null,
      assistantIds: input.assistantIds !== undefined ? JSON.stringify(input.assistantIds ?? []) : batch.assistantIds,
      status: input.assignedToId ? "ASSIGNED" : "PLANNED",
      updatedAt: now,
    })
    .where(eq(pmBatches.id, batchId));

  // The assignment is not real until it reaches the work orders. This is
  // the line that makes "assigning one person" mean all five machines.
  const woIds = (await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.batchId, batchId))).map(
    (w) => w.id,
  );
  if (woIds.length > 0) {
    await db
      .update(workOrders)
      .set({
        technicianId: input.assignedToId || null,
        technicianName: assignedToName,
        assistantIds: input.assistantIds !== undefined ? JSON.stringify(input.assistantIds ?? []) : undefined,
      })
      .where(inArray(workOrders.id, woIds));
  }

  // And onto the plan, so the schedule shows the same name as the job.
  await db
    .update(maintenanceSchedule)
    .set({ responsiblePersonId: input.assignedToId || null, responsiblePersonName: assignedToName })
    .where(eq(maintenanceSchedule.batchId, batchId));

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: actor.id ?? null,
    userName: actor.name || "System",
    action: "UPDATE",
    entityType: "pm_batch",
    entityId: batchId,
    entityDescription: input.assignedToId
      ? `${batch.batchNumber} assigned to ${assignedToName}, ${woIds.length} work order${woIds.length === 1 ? "" : "s"} stamped`
      : `${batch.batchNumber} assignment cleared`,
  });

  if (input.assignedToId) {
    try {
      await notify({
        event: "GENERAL",
        title: `PM assigned to you, ${batch.batchNumber}`,
        body:
          `${batch.title}. ${woIds.length} machine${woIds.length === 1 ? "" : "s"} planned for ` +
          `${batch.plannedDate}. The method statement, hazard analysis and permit for this batch ` +
          `cover all of them, and work cannot start until the permit is raised.`,
        linkPath: `/pm-batches/${batchId}`,
        relatedEntityType: "pm_batch",
        relatedEntityId: batchId,
        userIds: [String(input.assignedToId)],
      });
    } catch (err) {
      console.warn("pm-batch assign: notify failed", err);
    }
  }

  return { ok: true, assignedToName, workOrders: woIds.length };
}
