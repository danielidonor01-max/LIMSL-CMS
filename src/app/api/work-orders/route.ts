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
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch work orders:", error);
    return NextResponse.json(
      { error: "Failed to fetch work orders", details: message },
      { status: 500 },
    );
  }
}

// Next sequential work-order number, e.g. WO-2026-0031
async function nextWorkOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await db
    .select({ n: workOrders.workOrderNumber })
    .from(workOrders);
  let max = 0;
  for (const row of existing) {
    const m = row.n?.match(/WO-\d{4}-(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `WO-${year}-${String(max + 1).padStart(4, "0")}`;
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
    const workOrderNumber = await nextWorkOrderNumber();

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
      createdBy: body.createdBy || null,
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
      userName: body.createdByName || "System",
      action: "CREATE",
      entityType: "work_order",
      entityId: id,
      entityDescription: `${workOrderNumber} — ${body.title}`,
    });

    return NextResponse.json(newWo, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create work order:", error);
    return NextResponse.json(
      { error: "Failed to create work order", details: message },
      { status: 500 },
    );
  }
}
