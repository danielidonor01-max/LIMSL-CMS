// src/app/api/jha/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jhaDocuments, wmsDocuments, equipment, auditLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { JHA_WRITE_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { ensureSignoffChain, getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";

// Reflect a completed approval chain onto the document's own status, the same
// way the WMS and permit modules do, so a reader never sees "draft" on a paper
// that four people have signed.
export async function reconcileJha() {
  const rows = await db
    .select()
    .from(jhaDocuments)
    .where(eq(jhaDocuments.status, "UNDER_REVIEW"));
  for (const r of rows) {
    const chain = await getSignoffChain("JHA", r.id);
    if (!chain.length) continue;
    const summary = chainSummary(chain);
    if (summary.complete) {
      await db
        .update(jhaDocuments)
        .set({ status: "APPROVED", approvedAt: new Date().toISOString() })
        .where(eq(jhaDocuments.id, r.id));
    } else if (chain.some((s) => s.status === "REJECTED")) {
      await db.update(jhaDocuments).set({ status: "REJECTED" }).where(eq(jhaDocuments.id, r.id));
    }
  }
}

export async function GET() {
  try {
    await reconcileJha();

    const rows = await db
      .select({
        id: jhaDocuments.id,
        jhaNumber: jhaDocuments.jhaNumber,
        title: jhaDocuments.title,
        revision: jhaDocuments.revision,
        status: jhaDocuments.status,
        workArea: jhaDocuments.workArea,
        steps: jhaDocuments.steps,
        preparedByName: jhaDocuments.preparedByName,
        preparedDate: jhaDocuments.preparedDate,
        approvedAt: jhaDocuments.approvedAt,
        createdAt: jhaDocuments.createdAt,
        wmsId: jhaDocuments.wmsId,
        wmsNumber: wmsDocuments.wmsNumber,
        workOrderId: jhaDocuments.workOrderId,
        equipmentId: jhaDocuments.equipmentId,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
      })
      .from(jhaDocuments)
      .leftJoin(wmsDocuments, eq(jhaDocuments.wmsId, wmsDocuments.id))
      .leftJoin(equipment, eq(jhaDocuments.equipmentId, equipment.id))
      .orderBy(desc(jhaDocuments.createdAt));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Failed to fetch JHAs:", error);
    return NextResponse.json({ error: "Failed to fetch job hazard analyses" }, { status: 500 });
  }
}

type StepRow = { step?: string; hazards?: string; controls?: string; residualRisk?: string; responsible?: string };

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(JHA_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    if (!String(body.title ?? "").trim()) {
      return NextResponse.json({ error: "Give the analysis a title." }, { status: 400 });
    }

    // The JHA is written against an APPROVED method statement. Analysing a
    // method that has not been agreed means analysing a job that may still
    // change, and the hazards would be assessed against the wrong work.
    if (!body.wmsId) {
      return NextResponse.json(
        { error: "Select the approved Work Method Statement this analysis covers." },
        { status: 400 },
      );
    }
    const [wms] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, body.wmsId)).limit(1);
    if (!wms) return NextResponse.json({ error: "Work Method Statement not found." }, { status: 400 });
    if (wms.status !== "APPROVED") {
      return NextResponse.json(
        {
          error:
            `${wms.wmsNumber} is ${String(wms.status).toLowerCase().replace(/_/g, " ")}. ` +
            `A hazard analysis is written against an approved method statement.`,
        },
        { status: 409 },
      );
    }

    // A hazard analysis with no hazards is a cover sheet.
    const steps: StepRow[] = Array.isArray(body.steps)
      ? body.steps.filter(
          (r: StepRow) => r?.step?.trim() && r?.hazards?.trim() && r?.controls?.trim(),
        )
      : [];
    if (steps.length === 0) {
      return NextResponse.json(
        {
          error:
            "Add at least one job step with its hazards and controls. " +
            "A hazard analysis with no hazards authorises nothing (ISO 45001 6.1.2).",
        },
        { status: 400 },
      );
    }

    const jhaNumber = await nextDocNumber("JHA");
    const id = nanoid();

    const row = {
      id,
      jhaNumber,
      title: String(body.title).trim(),
      revision: 0,
      wmsId: wms.id,
      // Inherited from the method statement, so the whole chain points at one
      // work order rather than each document naming its own.
      workOrderId: wms.workOrderId ?? null,
      equipmentId: body.equipmentId || null,
      workArea: body.workArea || null,
      steps: JSON.stringify(steps),
      ppeRequired: Array.isArray(body.ppeRequired) ? JSON.stringify(body.ppeRequired) : "[]",
      emergencyArrangements: body.emergencyArrangements || null,
      status: "UNDER_REVIEW",
      preparedById: gate.actor?.id ?? null,
      preparedByName: gate.actor?.name ?? "Unknown",
      preparedDate: new Date().toISOString().slice(0, 10),
    };

    await db.insert(jhaDocuments).values(row);
    await ensureSignoffChain("JHA", id, jhaNumber);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "jha",
      entityId: id,
      entityDescription: `${jhaNumber} raised against ${wms.wmsNumber}, ${steps.length} step(s)`,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("Failed to create JHA:", error);
    return NextResponse.json({ error: "Failed to create the job hazard analysis" }, { status: 500 });
  }
}
