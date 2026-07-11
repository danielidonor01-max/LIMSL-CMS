// src/app/api/work-orders/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  workOrders,
  equipment,
  maintenanceSchedule,
  pmChecklists,
  auditLog,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Fetch a single work order with its equipment, linked schedule and PM checklist.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const wo = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (wo.length === 0) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const [eq1] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, wo[0].equipmentId))
      .limit(1);

    let schedule = null;
    if (wo[0].scheduleId) {
      const s = await db
        .select()
        .from(maintenanceSchedule)
        .where(eq(maintenanceSchedule.id, wo[0].scheduleId))
        .limit(1);
      schedule = s[0] ?? null;
    }

    const checklist = await db
      .select()
      .from(pmChecklists)
      .where(eq(pmChecklists.workOrderId, id))
      .limit(1);

    return NextResponse.json({
      ...wo[0],
      equipment: eq1 ?? null,
      schedule,
      checklist: checklist[0] ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch work order:", error);
    return NextResponse.json(
      { error: "Failed to fetch work order", details: message },
      { status: 500 },
    );
  }
}

// Update a work order (status transitions: start, cancel, etc.).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.status) updates.status = body.status;
    if (body.status === "IN_PROGRESS" && !body.startDate) {
      updates.startDate = new Date().toISOString().slice(0, 10);
    }
    if (body.priority) updates.priority = body.priority;
    if (body.technicianId !== undefined) updates.technicianId = body.technicianId;
    if (body.technicianName !== undefined) updates.technicianName = body.technicianName;
    if (body.description !== undefined) updates.description = body.description;

    await db.update(workOrders).set(updates).where(eq(workOrders.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userName: body.actorName || "System",
      action: "UPDATE",
      entityType: "work_order",
      entityId: id,
      changes: JSON.stringify(updates),
    });

    const [updated] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update work order:", error);
    return NextResponse.json(
      { error: "Failed to update work order", details: message },
      { status: 500 },
    );
  }
}
