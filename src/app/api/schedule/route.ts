// src/app/api/schedule/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maintenanceSchedule, equipment, auditLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { reconcileSchedule } from "@/lib/schedule";

// Returns every scheduled activity for the year, joined with its equipment.
export async function GET() {
  try {
    // Keep OVERDUE honest to today's date before reading.
    await reconcileSchedule();

    const rows = await db
      .select({
        id: maintenanceSchedule.id,
        equipmentId: maintenanceSchedule.equipmentId,
        year: maintenanceSchedule.year,
        quarter: maintenanceSchedule.quarter,
        month: maintenanceSchedule.month,
        plannedDate: maintenanceSchedule.plannedDate,
        activityType: maintenanceSchedule.activityType,
        taskDescription: maintenanceSchedule.taskDescription,
        maintenanceFrequency: maintenanceSchedule.maintenanceFrequency,
        responsiblePersonName: maintenanceSchedule.responsiblePersonName,
        status: maintenanceSchedule.status,
        completedDate: maintenanceSchedule.completedDate,
        workOrderId: maintenanceSchedule.workOrderId,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
        category: equipment.category,
        criticality: equipment.criticality,
        location: equipment.location,
      })
      .from(maintenanceSchedule)
      .leftJoin(equipment, eq(maintenanceSchedule.equipmentId, equipment.id))
      .orderBy(desc(maintenanceSchedule.plannedDate));

    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch schedule:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedule", details: message },
      { status: 500 },
    );
  }
}

// Create a scheduled maintenance activity (a PM, inspection, etc.). Recurrence
// then perpetuates it automatically once completed.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.equipmentId || !body.plannedDate || !body.activityType) {
      return NextResponse.json(
        { error: "equipmentId, plannedDate and activityType are required" },
        { status: 400 },
      );
    }

    const [eq0] = await db.select().from(equipment).where(eq(equipment.id, body.equipmentId)).limit(1);
    if (!eq0) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const d = new Date(`${String(body.plannedDate).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "Invalid planned date" }, { status: 400 });
    }

    const row = {
      id: nanoid(),
      equipmentId: body.equipmentId,
      year: d.getFullYear(),
      quarter: Math.floor(d.getMonth() / 3) + 1,
      month: d.getMonth() + 1,
      plannedDate: body.plannedDate.slice(0, 10),
      activityType: body.activityType,
      taskDescription: body.taskDescription || null,
      maintenanceFrequency: body.maintenanceFrequency || eq0.maintenanceFrequency || null,
      responsiblePersonId: body.responsiblePersonId || null,
      responsiblePersonName: body.responsiblePersonName || null,
      status: "SCHEDULED",
    };
    await db.insert(maintenanceSchedule).values(row);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "maintenance_schedule",
      entityId: row.id,
      entityDescription: `${row.activityType} scheduled for ${eq0.assetId} on ${row.plannedDate}`,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create schedule activity:", error);
    return NextResponse.json({ error: "Failed to create schedule activity", details: message }, { status: 500 });
  }
}
