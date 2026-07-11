// src/app/api/corrective/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { correctiveMaintenance, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const records = await db
      .select()
      .from(correctiveMaintenance)
      .where(eq(correctiveMaintenance.id, resolvedParams.id));

    if (records.length === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json(records[0]);
  } catch (error: any) {
    console.error("Failed to fetch corrective details:", error);
    return NextResponse.json({ error: "Failed to fetch details", details: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const resolvedParams = await params;
    const body = await request.json();

    const currentRecord = await db
      .select()
      .from(correctiveMaintenance)
      .where(eq(correctiveMaintenance.id, resolvedParams.id));

    if (currentRecord.length === 0) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const record = currentRecord[0];

    // Build fields to update
    const updateFields: any = {
      faultType: body.faultType ?? record.faultType,
      urgency: body.urgency ?? record.urgency,
      faultDescription: body.faultDescription ?? record.faultDescription,
      operatingStatusAtFailure: body.operatingStatusAtFailure ?? record.operatingStatusAtFailure,
      observedFault: body.observedFault ?? record.observedFault,
      errorCodes: body.errorCodes ?? record.errorCodes,
      environmentalCondition: body.environmentalCondition ?? record.environmentalCondition,
      
      // Downtime metrics
      reportedTime: body.reportedTime ?? record.reportedTime,
      technicianArrivalTime: body.technicianArrivalTime ?? record.technicianArrivalTime,
      repairStartTime: body.repairStartTime ?? record.repairStartTime,
      repairCompletedTime: body.repairCompletedTime ?? record.repairCompletedTime,
      restoredToServiceTime: body.restoredToServiceTime ?? record.restoredToServiceTime,
      totalDowntimeHours: body.totalDowntimeHours ?? record.totalDowntimeHours,
      productionImpact: body.productionImpact ?? record.productionImpact,
      
      // RCA fields
      rcaTool: body.rcaTool ?? record.rcaTool,
      rcaAnalysis: body.rcaAnalysis ? JSON.stringify(body.rcaAnalysis) : record.rcaAnalysis,
      rootCauseCategory: body.rootCauseCategory ?? record.rootCauseCategory,
      verifiedRootCause: body.verifiedRootCause ?? record.verifiedRootCause,
      
      // Corrective & Preventive actions (CATL)
      correctiveActions: body.correctiveActions ? JSON.stringify(body.correctiveActions) : record.correctiveActions,
      preventiveActions: body.preventiveActions ? JSON.stringify(body.preventiveActions) : record.preventiveActions,
      
      // Repair outcome
      partsReplaced: body.partsReplaced ?? record.partsReplaced,
      toolsUsed: body.toolsUsed ?? record.toolsUsed,
      immediateAction: body.immediateAction ?? record.immediateAction,
      repairStatus: body.repairStatus ?? record.repairStatus,
      requiresExternalExpert: body.requiresExternalExpert ?? record.requiresExternalExpert,
      externalExpertDetails: body.externalExpertDetails ?? record.externalExpertDetails,

      // Approvals & Sign-off
      technicianSignature: body.technicianSignature ?? record.technicianSignature,
      technicianName: body.technicianName ?? record.technicianName,
      supervisorSignature: body.supervisorSignature ?? record.supervisorSignature,
      supervisorName: body.supervisorName ?? record.supervisorName,
      supervisorComments: body.supervisorComments ?? record.supervisorComments,
      effectivenessChecked: body.effectivenessChecked ?? record.effectivenessChecked,
      closeOutDate: body.closeOutDate ?? record.closeOutDate,
      status: body.status ?? record.status,
      updatedAt: new Date().toISOString(),
    };

    // If closing out the corrective work, restore equipment to OPERATIONAL
    if (body.status === "CLOSED" && record.equipmentId) {
      await db
        .update(equipment)
        .set({
          status: "OPERATIONAL",
          lastMaintenanceDate: new Date().toISOString().split("T")[0],
          updatedAt: new Date().toISOString(),
        })
        .where(eq(equipment.id, record.equipmentId));
    }

    const updated = await db
      .update(correctiveMaintenance)
      .set(updateFields)
      .where(eq(correctiveMaintenance.id, resolvedParams.id))
      .returning();

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update corrective record:", error);
    return NextResponse.json({ error: "Failed to update record", details: error.message }, { status: 500 });
  }
}
