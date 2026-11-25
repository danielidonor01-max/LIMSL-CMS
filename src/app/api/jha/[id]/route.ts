// src/app/api/jha/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jhaDocuments, wmsDocuments, workOrders, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSignoffChain } from "@/lib/signoff/service";
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

    // Every revision of this analysis: followed both ways along supersedesId,
    // so opening any revision shows the whole history.
    const all = await db
      .select({
        id: jhaDocuments.id,
        jhaNumber: jhaDocuments.jhaNumber,
        title: jhaDocuments.title,
        revision: jhaDocuments.revision,
        status: jhaDocuments.status,
        changeSummary: jhaDocuments.changeSummary,
        preparedByName: jhaDocuments.preparedByName,
        preparedDate: jhaDocuments.preparedDate,
        approvedAt: jhaDocuments.approvedAt,
        createdAt: jhaDocuments.createdAt,
        supersedesId: jhaDocuments.supersedesId,
      })
      .from(jhaDocuments);
    const lineage = new Set<string>([row.id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const d of all) {
        const linked =
          (lineage.has(d.id) && d.supersedesId && !lineage.has(d.supersedesId)) ||
          (!lineage.has(d.id) && d.supersedesId && lineage.has(d.supersedesId));
        if (!linked) continue;
        lineage.add(lineage.has(d.id) ? d.supersedesId! : d.id);
        grew = true;
      }
    }
    const revisions = all
      .filter((d) => lineage.has(d.id))
      .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0));

    return NextResponse.json({
      ...row,
      wms: wms ? { id: wms.id, wmsNumber: wms.wmsNumber, title: wms.title, status: wms.status } : null,
      workOrder: wo
        ? { id: wo.id, workOrderNumber: wo.workOrderNumber, title: wo.title, status: wo.status }
        : null,
      equipment: eqRow ? { id: eqRow.id, name: eqRow.name, assetId: eqRow.assetId } : null,
      approval: chainSummary(chain),
      revisions,
    });
  } catch (error) {
    console.error("Failed to fetch JHA:", error);
    return NextResponse.json({ error: "Failed to fetch the job hazard analysis" }, { status: 500 });
  }
}

// There is deliberately no PATCH. A hazard analysis is revised by a new JHA
// naming the one it replaces (supersedesId, with what changed), which keeps
// the approved one and its signatures intact. The old edit route reset the
// chain in place, deleting the signatures already given, and no screen used it.
