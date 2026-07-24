// src/app/api/wms/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wmsDocuments, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { WMS_WRITE_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";

// A WMS document's status is DERIVED from its sign-off chain (WMS_CHAIN:
// Foreman → Maintenance Manager → HSE → Factory Manager), never set by a button.
//   no signatures          → DRAFT
//   some, not all           → UNDER_REVIEW
//   any required rejected   → REJECTED
//   all required signed     → APPROVED (+ approver = final signer)
// Same reconcile-on-read pattern as permits and the procedure module.
export async function reconcileWmsStatus(wmsId: string) {
  await ensureSignoffChain("WMS", wmsId);
  const chain = await getSignoffChain("WMS", wmsId);
  if (chain.length === 0) return;

  const rejected = chain.some((s) => s.required && s.status === "REJECTED");
  const summary = chainSummary(chain);
  const signedCount = chain.filter((s) => s.status === "SIGNED").length;

  let status: string;
  if (rejected) status = "REJECTED";
  else if (summary.complete) status = "APPROVED";
  else if (signedCount > 0) status = "UNDER_REVIEW";
  else status = "DRAFT";

  // Attribution comes from the signatures themselves.
  const finalStep = [...chain].reverse().find((s) => s.status === "SIGNED");
  const set: Record<string, unknown> = { status };
  if (status === "APPROVED" && finalStep) {
    set.approvedByName = finalStep.signedByName;
    set.approvedById = finalStep.signedById;
    set.approvedDate = (finalStep.signedAt ?? new Date().toISOString()).slice(0, 10);
  }
  await db.update(wmsDocuments).set(set).where(eq(wmsDocuments.id, wmsId));
}

export async function GET() {
  try {
    const raw = await db.select().from(wmsDocuments);
    for (const w of raw) await reconcileWmsStatus(w.id);
    const list = await db.select().from(wmsDocuments);
    const eqList = await db.select().from(equipment);
    const byId = new Map(eqList.map((e) => [e.id, e]));
    const enriched = list.map((w) => {
      // Resolve equipment names from either the scope JSON or the equipmentIds JSON
      let names: string[] = [];
      try {
        if (w.machinesScope) names = JSON.parse(w.machinesScope);
      } catch {}
      if (names.length === 0 && w.equipmentIds) {
        try {
          const ids: string[] = JSON.parse(w.equipmentIds);
          names = ids.map((id) => byId.get(id)?.name).filter(Boolean) as string[];
        } catch {}
      }
      return { ...w, equipmentName: names.join(", ") || null };
    });
    return NextResponse.json(enriched);
  } catch (error: any) {
    console.error("Failed to fetch WMS list:", error);
    return NextResponse.json({ error: "Failed to fetch WMS list" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(WMS_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    
    const wmsNumber = await nextDocNumber("WMS");

    const newWms = {
      id: nanoid(),
      wmsNumber,
      title: body.title,
      revision: body.revision || 0,
      machinesScope: body.machinesScope ? JSON.stringify(body.machinesScope) : "[]",
      equipmentIds: body.equipmentIds ? JSON.stringify(body.equipmentIds) : "[]",
      purpose: body.purpose || "",
      scope: body.scope || "",
      mobilization: body.mobilization || "",
      equipmentAndTools: body.equipmentAndTools ? JSON.stringify(body.equipmentAndTools) : "[]",
      materials: body.materials ? JSON.stringify(body.materials) : "[]",
      safetyRequirements: body.safetyRequirements || "",
      methodology: body.methodology || "",
      workProcedureSteps: body.workProcedureSteps ? JSON.stringify(body.workProcedureSteps) : "[]",
      hseRequirements: body.hseRequirements || "",
      qualityControlRequirements: body.qualityControlRequirements || "",
      emergencyRequirements: body.emergencyRequirements || "",
      references: body.references ? JSON.stringify(body.references) : "[]",
      status: "DRAFT",
      preparedById: gate.actor?.id ?? null,
      preparedByName: gate.actor?.name || "Unknown",
      preparedDate: new Date().toISOString().split("T")[0],
    };

    await db.insert(wmsDocuments).values(newWms);
    // Open the authorisation chain and notify the first signer (Foreman).
    await ensureSignoffChain("WMS", newWms.id, newWms.wmsNumber);
    return NextResponse.json(newWms, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create WMS document:", error);
    return NextResponse.json({ error: "Failed to create WMS" }, { status: 500 });
  }
}
