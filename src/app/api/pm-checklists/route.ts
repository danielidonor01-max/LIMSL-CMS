// src/app/api/pm-checklists/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  pmChecklists,
  workOrders,
  maintenanceSchedule,
  equipment,
  auditLog,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

// Submitting a completed PM checklist closes the loop:
//  1. persist the checklist (with drawn signatures)
//  2. mark the work order COMPLETED
//  3. mark the linked schedule activity COMPLETED
//  4. roll the equipment's last/next maintenance dates forward
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    if (!body.workOrderId || !body.equipmentId) {
      return NextResponse.json(
        { error: "workOrderId and equipmentId are required" },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const checklistId = nanoid();

    const checklist = {
      id: checklistId,
      workOrderId: body.workOrderId,
      equipmentId: body.equipmentId,
      date: body.date || today,
      ptwIssued: !!body.ptwIssued,
      lotoApplied: !!body.lotoApplied,
      ppeWorn: !!body.ppeWorn,
      areaSafe: !!body.areaSafe,
      visualInspection: JSON.stringify(body.visualInspection ?? []),
      functionalTests: JSON.stringify(body.functionalTests ?? []),
      lubrication: JSON.stringify(body.lubrication ?? []),
      electricalChecks: JSON.stringify(body.electricalChecks ?? []),
      calibrationMeasurements: body.calibrationMeasurements
        ? JSON.stringify(body.calibrationMeasurements)
        : null,
      observations: body.observations || "",
      correctiveActionRequired: !!body.correctiveActionRequired,
      actionDescription: body.actionDescription || "",
      sparePartsNeeded: body.sparePartsNeeded || "",
      pmCompleted: body.pmCompleted !== false,
      nextPMDate: body.nextPMDate || null,
      technicianSignature: body.technicianSignature || null,
      supervisorSignature: body.supervisorSignature || null,
      technicianName: body.technicianName || null,
      supervisorName: body.supervisorName || null,
      signedAt: new Date().toISOString(),
    };

    await db.insert(pmChecklists).values(checklist);

    // 2. Complete the work order
    await db
      .update(workOrders)
      .set({
        status: "COMPLETED",
        completionDate: today,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workOrders.id, body.workOrderId));

    // 3. Complete the linked schedule activity, if any
    const [wo] = await db
      .select()
      .from(workOrders)
      .where(eq(workOrders.id, body.workOrderId))
      .limit(1);
    if (wo?.scheduleId) {
      await db
        .update(maintenanceSchedule)
        .set({ status: "COMPLETED", completedDate: today })
        .where(eq(maintenanceSchedule.id, wo.scheduleId));
    }

    // 4. Roll the equipment maintenance dates forward
    await db
      .update(equipment)
      .set({
        lastMaintenanceDate: today,
        nextMaintenanceDate: body.nextPMDate || null,
        status: body.correctiveActionRequired ? "UNDER_MAINTENANCE" : "OPERATIONAL",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(equipment.id, body.equipmentId));

    await db.insert(auditLog).values({
      id: nanoid(),
      userName: body.technicianName || "Technician",
      action: "SIGN",
      entityType: "pm_checklist",
      entityId: checklistId,
      entityDescription: `PM checklist signed for WO ${wo?.workOrderNumber ?? body.workOrderId}`,
    });

    return NextResponse.json({ ...checklist, id: checklistId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to submit PM checklist:", error);
    return NextResponse.json(
      { error: "Failed to submit PM checklist", details: message },
      { status: 500 },
    );
  }
}
