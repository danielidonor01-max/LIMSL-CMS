// src/app/api/jha/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jhaDocuments, wmsDocuments, workOrders, equipment, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { JHA_WRITE_ROLES } from "@/lib/roles";
import { getSignoffChain, resetSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";
import { reconcileJha } from "../route";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await reconcileJha();
    const { id } = await params;

    const [row] = await db.select().from(jhaDocuments).where(eq(jhaDocuments.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "Job hazard analysis not found" }, { status: 404 });

    const [wms] = row.wmsId
      ? await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, row.wmsId)).limit(1)
      : [null];
    const [wo] = row.workOrderId
      ? await db.select().from(workOrders).where(eq(workOrders.id, row.workOrderId)).limit(1)
      : [null];
    const [eqRow] = row.equipmentId
      ? await db.select().from(equipment).where(eq(equipment.id, row.equipmentId)).limit(1)
      : [null];

    const chain = await getSignoffChain("JHA", id);

    return NextResponse.json({
      ...row,
      wms: wms ? { id: wms.id, wmsNumber: wms.wmsNumber, title: wms.title, status: wms.status } : null,
      workOrder: wo
        ? { id: wo.id, workOrderNumber: wo.workOrderNumber, title: wo.title, status: wo.status }
        : null,
      equipment: eqRow ? { id: eqRow.id, name: eqRow.name, assetId: eqRow.assetId } : null,
      approval: chainSummary(chain),
    });
  } catch (error) {
    console.error("Failed to fetch JHA:", error);
    return NextResponse.json({ error: "Failed to fetch the job hazard analysis" }, { status: 500 });
  }
}

type StepRow = { step?: string; hazards?: string; controls?: string; residualRisk?: string; responsible?: string };

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(JHA_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [row] = await db.select().from(jhaDocuments).where(eq(jhaDocuments.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "Job hazard analysis not found" }, { status: 404 });

    // An approved analysis is the document a permit was issued against. Editing
    // it in place would change what the signatures attested to, so it is revised
    // instead: revision up, status back to review, signatures cleared.
    const isApproved = row.status === "APPROVED";

    const set: Partial<typeof jhaDocuments.$inferInsert> = {};
    if (typeof body.title === "string" && body.title.trim()) set.title = body.title.trim();
    if (body.workArea !== undefined) set.workArea = body.workArea || null;
    if (body.emergencyArrangements !== undefined) {
      set.emergencyArrangements = body.emergencyArrangements || null;
    }
    if (body.equipmentId !== undefined) set.equipmentId = body.equipmentId || null;
    if (Array.isArray(body.ppeRequired)) set.ppeRequired = JSON.stringify(body.ppeRequired);

    if (Array.isArray(body.steps)) {
      const steps: StepRow[] = body.steps.filter(
        (r: StepRow) => r?.step?.trim() && r?.hazards?.trim() && r?.controls?.trim(),
      );
      if (steps.length === 0) {
        return NextResponse.json(
          { error: "Keep at least one job step with its hazards and controls." },
          { status: 400 },
        );
      }
      set.steps = JSON.stringify(steps);
    }

    if (Object.keys(set).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    if (isApproved) {
      set.revision = (row.revision ?? 0) + 1;
      set.status = "UNDER_REVIEW";
      set.approvedAt = null;
    }

    await db.update(jhaDocuments).set(set).where(eq(jhaDocuments.id, id));

    if (isApproved) {
      await resetSignoffChain("JHA", id, row.jhaNumber);
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "jha",
      entityId: id,
      entityDescription: isApproved
        ? `${row.jhaNumber} revised to rev ${set.revision}, approvals cleared and re-issued for signature`
        : `${row.jhaNumber} updated`,
    });

    const [updated] = await db.select().from(jhaDocuments).where(eq(jhaDocuments.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update JHA:", error);
    return NextResponse.json({ error: "Failed to update the job hazard analysis" }, { status: 500 });
  }
}
