// src/app/api/audit/auto-detect/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maintenanceSchedule, nonConformities, equipment } from "@/lib/db/schema";
import { eq, lt, and, not, count } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function POST() {
  try {
    const todayStr = new Date().toISOString().split("T")[0];
    
    // 1. Detect missed PM schedules
    // plannedDate < today and status != 'COMPLETED'
    const missedSchedules = await db
      .select({
        id: maintenanceSchedule.id,
        plannedDate: maintenanceSchedule.plannedDate,
        equipmentId: maintenanceSchedule.equipmentId,
        taskDescription: maintenanceSchedule.taskDescription,
      })
      .from(maintenanceSchedule)
      .where(
        and(
          lt(maintenanceSchedule.plannedDate, todayStr),
          not(eq(maintenanceSchedule.status, "COMPLETED"))
        )
      );

    let createdCount = 0;
    const detected: any[] = [];

    // Fetch existing NC count to increment numbers
    const ncCountResult = await db.select({ value: count() }).from(nonConformities);
    let totalNcCount = ncCountResult[0]?.value || 0;

    for (const sched of missedSchedules) {
      // Check if NC already exists
      const existing = await db
        .select()
        .from(nonConformities)
        .where(
          and(
            eq(nonConformities.relatedEntityType, "maintenance_schedule"),
            eq(nonConformities.relatedEntityId, sched.id)
          )
        );

      if (existing.length === 0) {
        // Fetch machine name
        const machine = await db
          .select({ name: equipment.name, assetId: equipment.assetId })
          .from(equipment)
          .where(eq(equipment.id, sched.equipmentId));
        const machineName = machine[0]?.name || "Asset";
        const assetId = machine[0]?.assetId || "";

        totalNcCount++;
        const ncNumber = `NC-2026-${totalNcCount.toString().padStart(4, "0")}`;

        const newNc = {
          id: nanoid(),
          ncNumber,
          type: "MISSED_PM",
          severity: "HIGH" as const,
          detectedDate: todayStr,
          detectedBy: "Automated Compliance Audit",
          relatedEntityType: "maintenance_schedule",
          relatedEntityId: sched.id,
          equipmentId: sched.equipmentId,
          description: `Overdue Preventive Maintenance: Scheduled PM for ${machineName} (${assetId}) planned for ${sched.plannedDate} was not executed on time. Task description: ${sched.taskDescription || "PM Inspection"}.`,
          status: "OPEN",
          autoDetected: true,
        };

        await db.insert(nonConformities).values(newNc);
        detected.push(newNc);
        createdCount++;
      }
    }

    return NextResponse.json({
      message: `Compliance audit completed. Missed schedules checked.`,
      detectedMissedPMsCount: missedSchedules.length,
      newNonConformitiesRaised: createdCount,
      raisedList: detected,
    });
  } catch (error: any) {
    console.error("Auto-detect audit failed:", error);
    return NextResponse.json({ error: "Audit scan failed", details: error.message }, { status: 500 });
  }
}
