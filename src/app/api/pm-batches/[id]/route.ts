// src/app/api/pm-batches/[id]/route.ts
// One PM batch: what it covers, how far along it is, and assigning it.
//
// Assigning a batch is the one action here that carries weight. It is not a
// note on a screen — it puts every machine in the batch on one person's list,
// stamps their name onto each work order underneath, and tells them. That is
// what the shop floor means by "the PM was assigned to him".
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  pmBatches,
  maintenanceSchedule,
  equipment,
  workOrders,
  wmsDocuments,
  jhaDocuments,
  permits,
  users,
  auditLog,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { requireRoles } from "@/lib/authz";
import { WORK_ASSIGN_ROLES } from "@/lib/roles";
import { notify } from "@/lib/notifications";
import { pmFlowState } from "@/lib/maintenance/flow";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";

async function loadBatch(id: string) {
  const [batch] = await db.select().from(pmBatches).where(eq(pmBatches.id, id)).limit(1);
  if (!batch) return null;

  const wos = await db
    .select({
      id: workOrders.id,
      workOrderNumber: workOrders.workOrderNumber,
      equipmentId: workOrders.equipmentId,
      title: workOrders.title,
      status: workOrders.status,
      technicianName: workOrders.technicianName,
      assetId: equipment.assetId,
      machineName: equipment.name,
    })
    .from(workOrders)
    .leftJoin(equipment, eq(workOrders.equipmentId, equipment.id))
    .where(eq(workOrders.batchId, id));

  const [wms] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.batchId, id)).limit(1);
  const [jha] = await db.select().from(jhaDocuments).where(eq(jhaDocuments.batchId, id)).limit(1);
  const [permit] = await db.select().from(permits).where(eq(permits.batchId, id)).limit(1);

  const flow = pmFlowState({
    batchId: batch.id,
    assignedToId: batch.assignedToId,
    workOrderCount: wos.length,
    wmsStatus: wms?.status ?? null,
    jhaStatus: jha?.status ?? null,
    permitStatus: permit?.status ?? null,
    completed: batch.status === "COMPLETED",
  });

  return {
    ...batch,
    categoryLabel: EQUIPMENT_CATEGORY_LABELS[batch.category] ?? batch.category,
    workOrders: wos,
    wms: wms ?? null,
    jha: jha ?? null,
    permit: permit ?? null,
    flow,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const batch = await loadBatch(id);
    if (!batch) return NextResponse.json({ error: "PM batch not found" }, { status: 404 });
    return NextResponse.json(batch);
  } catch (error) {
    console.error("Failed to fetch PM batch:", error);
    return NextResponse.json({ error: "Failed to fetch PM batch" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const [batch] = await db.select().from(pmBatches).where(eq(pmBatches.id, id)).limit(1);
    if (!batch) return NextResponse.json({ error: "PM batch not found" }, { status: 404 });

    // ── Assignment ────────────────────────────────────────────────────────
    // Same gate as the schedule: a technician may raise, defer or reschedule
    // their own work, but putting a job on somebody else is a foreman's call
    // and above.
    const touchesAssignment =
      body.assignedToId !== undefined || body.assistantIds !== undefined;
    if (touchesAssignment) {
      const gate = await requireRoles(WORK_ASSIGN_ROLES);
      if (gate.res) return gate.res;

      let assignedToName: string | null = null;
      if (body.assignedToId) {
        const [person] = await db
          .select({ id: users.id, name: users.name, isActive: users.isActive })
          .from(users)
          .where(eq(users.id, String(body.assignedToId)))
          .limit(1);
        if (!person) {
          return NextResponse.json({ error: "That person was not found." }, { status: 400 });
        }
        if (person.isActive === false) {
          return NextResponse.json(
            { error: `${person.name} is no longer an active account.` },
            { status: 409 },
          );
        }
        assignedToName = person.name;
      }

      const now = new Date().toISOString();
      await db
        .update(pmBatches)
        .set({
          assignedToId: body.assignedToId || null,
          assignedToName,
          assignedById: body.assignedToId ? (gate.actor?.id ?? null) : null,
          assignedByName: body.assignedToId ? (gate.actor?.name ?? null) : null,
          assignedAt: body.assignedToId ? now : null,
          assistantIds:
            body.assistantIds !== undefined ? JSON.stringify(body.assistantIds ?? []) : batch.assistantIds,
          status: body.assignedToId ? "ASSIGNED" : "PLANNED",
          updatedAt: now,
        })
        .where(eq(pmBatches.id, id));

      // The assignment is not real until it reaches the work orders. This is
      // the line that makes "assigning one person" mean all five machines.
      const woIds = (
        await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.batchId, id))
      ).map((w) => w.id);

      if (woIds.length > 0) {
        await db
          .update(workOrders)
          .set({
            technicianId: body.assignedToId || null,
            technicianName: assignedToName,
            assistantIds:
              body.assistantIds !== undefined ? JSON.stringify(body.assistantIds ?? []) : undefined,
          })
          .where(inArray(workOrders.id, woIds));
      }

      // And onto the plan, so the schedule shows the same name as the job.
      await db
        .update(maintenanceSchedule)
        .set({ responsiblePersonId: body.assignedToId || null, responsiblePersonName: assignedToName })
        .where(eq(maintenanceSchedule.batchId, id));

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "pm_batch",
        entityId: id,
        entityDescription: body.assignedToId
          ? `${batch.batchNumber} assigned to ${assignedToName}, ${woIds.length} work order${woIds.length === 1 ? "" : "s"} stamped`
          : `${batch.batchNumber} assignment cleared`,
      });

      if (body.assignedToId) {
        try {
          await notify({
            event: "GENERAL",
            title: `PM assigned to you, ${batch.batchNumber}`,
            body:
              `${batch.title}. ${woIds.length} machine${woIds.length === 1 ? "" : "s"} planned for ` +
              `${batch.plannedDate}. The method statement, hazard analysis and permit for this batch ` +
              `cover all of them, and work cannot start until the permit is raised.`,
            linkPath: `/pm-batches/${id}`,
            relatedEntityType: "pm_batch",
            relatedEntityId: id,
            userIds: [String(body.assignedToId)],
          });
        } catch (err) {
          console.warn("pm-batch assign: notify failed", err);
        }
      }

      return NextResponse.json(await loadBatch(id));
    }

    // ── Everything else ───────────────────────────────────────────────────
    const gate = await requireRoles(WORK_ASSIGN_ROLES);
    if (gate.res) return gate.res;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.status !== undefined) patch.status = body.status;
    if (body.status === "COMPLETED") patch.completedDate = new Date().toISOString().slice(0, 10);

    await db.update(pmBatches).set(patch).where(eq(pmBatches.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "pm_batch",
      entityId: id,
      entityDescription: `${batch.batchNumber} updated`,
    });

    return NextResponse.json(await loadBatch(id));
  } catch (error) {
    console.error("Failed to update PM batch:", error);
    return NextResponse.json({ error: "Failed to update PM batch" }, { status: 500 });
  }
}
