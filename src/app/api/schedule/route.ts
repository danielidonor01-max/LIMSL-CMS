// src/app/api/schedule/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maintenanceSchedule, equipment } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

// Returns every scheduled activity for the year, joined with its equipment.
export async function GET() {
  try {
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
