// src/app/api/wms/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wmsDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { WMS_WRITE_ROLES } from "@/lib/roles";
import { reconcileWmsStatus } from "../route";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    await reconcileWmsStatus(resolvedParams.id);
    const records = await db
      .select()
      .from(wmsDocuments)
      .where(eq(wmsDocuments.id, resolvedParams.id));

    if (records.length === 0) {
      return NextResponse.json({ error: "WMS not found" }, { status: 404 });
    }

    return NextResponse.json(records[0]);
  } catch (error: any) {
    console.error("Failed to fetch WMS details:", error);
    return NextResponse.json({ error: "Failed to fetch WMS details", details: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireRoles(WMS_WRITE_ROLES);
    if (gate.res) return gate.res;

    const resolvedParams = await params;
    const body = await request.json();

    const currentRecords = await db
      .select()
      .from(wmsDocuments)
      .where(eq(wmsDocuments.id, resolvedParams.id));

    if (currentRecords.length === 0) {
      return NextResponse.json({ error: "WMS not found" }, { status: 404 });
    }

    const wms = currentRecords[0];

    // Content edits only. Approval/status is DERIVED from the sign-off chain
    // (see reconcileWmsStatus) — it can never be forced through the API, so the
    // status and reviewed/approved fields are deliberately NOT writable here.
    const updateFields: any = {
      title: body.title ?? wms.title,
      revision: body.revision ?? wms.revision,
      machinesScope: body.machinesScope ? JSON.stringify(body.machinesScope) : wms.machinesScope,
      equipmentIds: body.equipmentIds ? JSON.stringify(body.equipmentIds) : wms.equipmentIds,
      purpose: body.purpose ?? wms.purpose,
      scope: body.scope ?? wms.scope,
      mobilization: body.mobilization ?? wms.mobilization,
      equipmentAndTools: body.equipmentAndTools ? JSON.stringify(body.equipmentAndTools) : wms.equipmentAndTools,
      materials: body.materials ? JSON.stringify(body.materials) : wms.materials,
      safetyRequirements: body.safetyRequirements ?? wms.safetyRequirements,
      methodology: body.methodology ?? wms.methodology,
      workProcedureSteps: body.workProcedureSteps ? JSON.stringify(body.workProcedureSteps) : wms.workProcedureSteps,
      hseRequirements: body.hseRequirements ?? wms.hseRequirements,
      qualityControlRequirements: body.qualityControlRequirements ?? wms.qualityControlRequirements,
      emergencyRequirements: body.emergencyRequirements ?? wms.emergencyRequirements,
      references: body.references ? JSON.stringify(body.references) : wms.references,
      updatedAt: new Date().toISOString(),
    };

    const updated = await db
      .update(wmsDocuments)
      .set(updateFields)
      .where(eq(wmsDocuments.id, resolvedParams.id))
      .returning();

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update WMS document:", error);
    return NextResponse.json({ error: "Failed to update WMS", details: error.message }, { status: 500 });
  }
}
