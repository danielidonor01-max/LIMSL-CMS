// src/app/api/work-orders/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  workOrders,
  equipment,
  maintenanceSchedule,
  auditLog,
} from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { notify } from "@/lib/notifications";
import { suggestedWoPriority } from "@/lib/maintenance/adherence";
import { ensureSignoffChain } from "@/lib/signoff/service";
import { reconcileWorkOrderApprovals, WO_APPROVAL_ENTITY } from "@/lib/work-order-approval";

// List all work orders, joined with their equipment.
export async function GET() {
  try {
    // Approvals signed since the last read land before anyone sees the list.
    await reconcileWorkOrderApprovals();

    const rows = await db
      .select({
        id: workOrders.id,
        workOrderNumber: workOrders.workOrderNumber,
        type: workOrders.type,
        status: workOrders.status,
        priority: workOrders.priority,
        title: workOrders.title,
        plannedDate: workOrders.plannedDate,
        completionDate: workOrders.completionDate,
        technicianName: workOrders.technicianName,
        equipmentId: workOrders.equipmentId,
        scheduleId: workOrders.scheduleId,
        createdAt: workOrders.createdAt,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
        category: equipment.category,
        location: equipment.location,
      })
      .from(workOrders)
      .leftJoin(equipment, eq(workOrders.equipmentId, equipment.id))
      .orderBy(desc(workOrders.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch work orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch work orders" },
      { status: 500 },
    );
  }
}

// Create a new work order.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    if (!body.equipmentId || !body.type || !body.title) {
      return NextResponse.json(
        { error: "equipmentId, type and title are required" },
        { status: 400 },
      );
    }

    const id = nanoid();
    const workOrderNumber = await nextDocNumber("WO");

    // Criticality was a badge colour consumed by nothing. A job on a machine
    // that stops production should not default to the same priority as one on
    // a bench grinder, the client can still override.
    const [eqRow] = await db
      .select({ criticality: equipment.criticality })
      .from(equipment)
      .where(eq(equipment.id, body.equipmentId))
      .limit(1);

    // A job raised off a plan inherits the people already named on that plan,
    // otherwise the assignment made on the schedule is silently lost the moment
    // the work order exists and nobody is told the job is theirs.
    let inherited: { technicianId: string | null; technicianName: string | null; assistantIds: string | null } = {
      technicianId: null,
      technicianName: null,
      assistantIds: null,
    };
    if (body.scheduleId && !body.technicianId) {
      const [sched] = await db
        .select({
          responsiblePersonId: maintenanceSchedule.responsiblePersonId,
          responsiblePersonName: maintenanceSchedule.responsiblePersonName,
          assistantIds: maintenanceSchedule.assistantIds,
        })
        .from(maintenanceSchedule)
        .where(eq(maintenanceSchedule.id, body.scheduleId))
        .limit(1);
      if (sched) {
        inherited = {
          technicianId: sched.responsiblePersonId ?? null,
          technicianName: sched.responsiblePersonName ?? null,
          assistantIds: sched.assistantIds ?? null,
        };
      }
    }

    const newWo = {
      id,
      workOrderNumber,
      type: body.type,
      equipmentId: body.equipmentId,
      scheduleId: body.scheduleId || null,
      priority: body.priority || suggestedWoPriority(eqRow?.criticality),
      // Raised as a request. Management authorising commencement is the whole
      // point of the work order, and it is signed, not assumed.
      status: "PENDING_APPROVAL",
      title: body.title,
      description: body.description || "",
      plannedDate: body.plannedDate || null,
      technicianId: body.technicianId || inherited.technicianId,
      technicianName: body.technicianName || inherited.technicianName,
      assistantIds: inherited.assistantIds,
      supervisorId: body.supervisorId || null,
      createdBy: gate.actor?.id ?? null,
    };

    await db.insert(workOrders).values(newWo);

    // If this WO fulfils a scheduled activity, link it back.
    if (body.scheduleId) {
      await db
        .update(maintenanceSchedule)
        .set({ workOrderId: id })
        .where(eq(maintenanceSchedule.id, body.scheduleId));
    }

    await ensureSignoffChain(WO_APPROVAL_ENTITY, id, workOrderNumber);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "work_order",
      entityId: id,
      entityDescription: `${workOrderNumber}, ${body.title}, raised for approval`,
    });

    // Tell the assigned technician their job exists. Best-effort.
    if (newWo.technicianId) {
      try {
        await notify({
          event: "GENERAL",
          title: `Work order assigned to you, ${workOrderNumber}`,
          body: `${newWo.title}. Priority ${newWo.priority}${newWo.plannedDate ? `, planned ${newWo.plannedDate}` : ""}. Awaiting approval to commence.`,
          linkPath: `/work-orders/${id}`,
          relatedEntityType: "work_order",
          relatedEntityId: id,
          userIds: [newWo.technicianId],
        });
      } catch (err) {
        console.warn("work-order create: assignment notify failed", err);
      }
    }

    return NextResponse.json(newWo, { status: 201 });
  } catch (error) {
    console.error("Failed to create work order:", error);
    return NextResponse.json(
      { error: "Failed to create work order" },
      { status: 500 },
    );
  }
}
