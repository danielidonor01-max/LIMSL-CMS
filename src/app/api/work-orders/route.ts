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

// List all work orders, joined with their equipment.
export async function GET() {
  try {
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

    const newWo = {
      id,
      workOrderNumber,
      type: body.type,
      equipmentId: body.equipmentId,
      scheduleId: body.scheduleId || null,
      priority: body.priority || "MEDIUM",
      status: "OPEN",
      title: body.title,
      description: body.description || "",
      plannedDate: body.plannedDate || null,
      technicianId: body.technicianId || null,
      technicianName: body.technicianName || null,
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

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "work_order",
      entityId: id,
      entityDescription: `${workOrderNumber} — ${body.title}`,
    });

    return NextResponse.json(newWo, { status: 201 });
  } catch (error) {
    console.error("Failed to create work order:", error);
    return NextResponse.json(
      { error: "Failed to create work order" },
      { status: 500 },
    );
  }
}
