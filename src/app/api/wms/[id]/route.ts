// src/app/api/wms/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wmsDocuments, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { WMS_WRITE_ROLES } from "@/lib/roles";
import { getSignoffChain, resetSignoffChain } from "@/lib/signoff/service";
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
    return NextResponse.json({ error: "Failed to fetch WMS details" }, { status: 500 });
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

    // A WMS is a controlled safety document: once anyone has signed it (or
    // rejected it), its content can only change under a NEW revision with a
    // fresh approval chain — signatures attest to specific content, and silent
    // post-signature edits would leave operators working an unreviewed method.
    const chain = await getSignoffChain("WMS", wms.id);
    const hasSignatures = chain.some((s) => s.status === "SIGNED" || s.status === "REJECTED");
    const CONTENT_KEYS = [
      "title", "machinesScope", "equipmentIds", "purpose", "scope", "mobilization",
      "equipmentAndTools", "materials", "safetyRequirements", "methodology",
      "workProcedureSteps", "hseRequirements", "qualityControlRequirements",
      "emergencyRequirements", "references",
    ];
    const touchesContent = CONTENT_KEYS.some((k) => body[k] !== undefined);
    const startsNewRevision = hasSignatures && touchesContent;

    // Content edits only. Approval/status is DERIVED from the sign-off chain
    // (see reconcileWmsStatus) — it can never be forced through the API, so the
    // status and reviewed/approved fields are deliberately NOT writable here.
    const updateFields: any = {
      title: body.title ?? wms.title,
      revision: startsNewRevision ? (wms.revision ?? 0) + 1 : wms.revision,
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

    if (startsNewRevision) {
      // Clear the previous approval attribution; the new revision has none yet.
      updateFields.approvedByName = null;
      updateFields.approvedById = null;
      updateFields.approvedDate = null;
    }

    const updated = await db
      .update(wmsDocuments)
      .set(updateFields)
      .where(eq(wmsDocuments.id, resolvedParams.id))
      .returning();

    if (startsNewRevision) {
      await resetSignoffChain("WMS", wms.id, wms.wmsNumber);
      await reconcileWmsStatus(wms.id); // derives DRAFT from the fresh chain
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name ?? "User",
        action: "UPDATE",
        entityType: "wms",
        entityId: wms.id,
        entityDescription: `WMS ${wms.wmsNumber} content changed after sign-off — revision ${(wms.revision ?? 0) + 1} opened, approval chain reset`,
      });
    }

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update WMS document:", error);
    return NextResponse.json({ error: "Failed to update WMS" }, { status: 500 });
  }
}
