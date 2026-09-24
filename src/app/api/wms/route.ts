// src/app/api/wms/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wmsDocuments, jhaDocuments, equipment, workOrders, pmBatches, auditLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
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

  // An approved revision retires the one it replaces, and takes its hazard
  // analysis out of date with it. The analysis is NOT rejected or deleted —
  // it was correct for the method it was written against, and that record is
  // the evidence. It is marked superseded, which is what makes the permit
  // route refuse the next permit until HSE has revised it.
  if (status === "APPROVED") {
    const [row] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, wmsId)).limit(1);
    if (row?.supersedesId) {
      await db
        .update(wmsDocuments)
        .set({ status: "SUPERSEDED" })
        .where(eq(wmsDocuments.id, row.supersedesId));
      await db
        .update(jhaDocuments)
        .set({ status: "SUPERSEDED" })
        .where(eq(jhaDocuments.wmsId, row.supersedesId));
    }
  }
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

    // The work order is optional here, and this is a deliberate reversal.
    //
    // It used to be required and had to be approved, on the reasoning that a
    // method is written for work somebody has sanctioned. The UX review found
    // that this deadlocks a new job: safety documents cannot be prepared until
    // the work is authorised, and the work cannot sensibly be authorised
    // without seeing how it will be done. LIMSL confirmed the review is right
    // about their process. A method statement is now written when the job is
    // identified, and the authorisation gate moved downstream to the permit,
    // which is where it actually bites: see src/app/api/permits/route.ts.
    //
    // The rest of the chain is unchanged. A hazard analysis still needs an
    // approved method statement, and a permit still needs an approved analysis.
    let workOrderId: string | null = null;
    if (body.workOrderId) {
      const [wo] = await db
        .select()
        .from(workOrders)
        .where(eq(workOrders.id, body.workOrderId))
        .limit(1);
      if (!wo) return NextResponse.json({ error: "Work order not found." }, { status: 400 });
      if (wo.status === "CANCELLED") {
        return NextResponse.json(
          { error: `${wo.workOrderNumber} was cancelled.` },
          { status: 409 },
        );
      }
      workOrderId = wo.id;
    }

    // ── Scope ─────────────────────────────────────────────────────────────
    // A standing method statement belongs to a CATEGORY, not to a job. How you
    // service CNC light-duty machines does not change because it is October
    // rather than March, so the method is written once for the category and
    // revised thereafter. Every PM of those machines runs under it.
    //
    // The scope is therefore every machine in the category, read from the
    // register rather than taken from the request. That is also what makes a
    // new machine a REVISION: the moment it joins the category the method
    // covers a machine it was not written for, and the document has to say so.
    //
    // A WMS with no category is a one-off — a breakdown repair on a single
    // machine — and keeps the machines it was given.
    let category: string | null = body.category ? String(body.category) : null;
    let batchId: string | null = null;
    let scopeIds: string[] = Array.isArray(body.equipmentIds) ? body.equipmentIds : [];
    let scopeNames: string[] = Array.isArray(body.machinesScope) ? body.machinesScope : [];

    // Raised from a batch: the batch names the category, and the category
    // decides the scope. The batch does not own the document.
    if (body.batchId) {
      const [batch] = await db.select().from(pmBatches).where(eq(pmBatches.id, body.batchId)).limit(1);
      if (!batch) return NextResponse.json({ error: "PM batch not found." }, { status: 400 });
      batchId = batch.id;
      category = category ?? batch.category;
      if (!workOrderId) {
        const [lead] = await db
          .select({ id: workOrders.id })
          .from(workOrders)
          .where(eq(workOrders.batchId, batch.id))
          .limit(1);
        if (lead) workOrderId = lead.id;
      }
    }

    let revision = Number(body.revision ?? 0) || 0;
    let supersedesId: string | null = null;

    if (category) {
      const machines = await db
        .select({ id: equipment.id, assetId: equipment.assetId, name: equipment.name })
        .from(equipment)
        .where(eq(equipment.category, category));
      if (machines.length === 0) {
        return NextResponse.json(
          { error: "No machines are on the register under that category." },
          { status: 409 },
        );
      }
      scopeIds = machines.map((m) => m.id);
      scopeNames = machines.map((m) => [m.assetId, m.name].filter(Boolean).join(" "));

      // A revision continues the category's lineage rather than starting a new
      // document, which is what makes 'which method was this job done under'
      // answerable years later.
      const [latest] = await db
        .select()
        .from(wmsDocuments)
        .where(eq(wmsDocuments.category, category))
        .orderBy(desc(wmsDocuments.revision))
        .limit(1);
      if (latest) {
        if (latest.status !== "APPROVED" && latest.status !== "SUPERSEDED" && latest.status !== "REJECTED") {
          return NextResponse.json(
            {
              error:
                `${latest.wmsNumber} for this category is still being reviewed. ` +
                `Finish or reject it before starting another revision.`,
            },
            { status: 409 },
          );
        }
        revision = (latest.revision ?? 0) + 1;
        supersedesId = latest.id;
      } else {
        revision = 1;
      }
    }
    const wmsNumber = await nextDocNumber("WMS");

    const newWms = {
      id: nanoid(),
      wmsNumber,
      title: body.title,
      workOrderId,
      revision,
      machinesScope: JSON.stringify(scopeNames),
      batchId,
      category,
      supersedesId,
      changeSummary: body.changeSummary || null,
      equipmentIds: JSON.stringify(scopeIds),
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

    if (batchId) {
      await db.update(pmBatches).set({ wmsId: newWms.id }).where(eq(pmBatches.id, batchId));
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "CREATE",
        entityType: "wms",
        entityId: newWms.id,
        entityDescription: `${wmsNumber} written for PM batch, covering ${scopeIds.length} machine${scopeIds.length === 1 ? "" : "s"}`,
      });
    }
    // Open the authorisation chain and notify the first signer (Foreman).
    await ensureSignoffChain("WMS", newWms.id, newWms.wmsNumber);
    return NextResponse.json(newWms, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create WMS document:", error);
    return NextResponse.json({ error: "Failed to create WMS" }, { status: 500 });
  }
}
