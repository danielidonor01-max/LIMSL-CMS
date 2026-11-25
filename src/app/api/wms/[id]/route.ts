// src/app/api/wms/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wmsDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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

    const currentWms = records[0];

    // Collect all documents in this lineage (by category or ancestor/descendant link)
    const allDocs = await db.select().from(wmsDocuments);
    const lineageIds = new Set<string>([currentWms.id]);
    if (currentWms.category) {
      for (const d of allDocs) {
        if (d.category === currentWms.category) lineageIds.add(d.id);
      }
    }
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const d of allDocs) {
        if (lineageIds.has(d.id)) {
          if (d.supersedesId && !lineageIds.has(d.supersedesId)) {
            lineageIds.add(d.supersedesId);
            expanded = true;
          }
        } else if (d.supersedesId && lineageIds.has(d.supersedesId)) {
          lineageIds.add(d.id);
          expanded = true;
        }
      }
    }

    const revisions = allDocs
      .filter((d) => lineageIds.has(d.id))
      .sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))
      .map((d) => ({
        id: d.id,
        wmsNumber: d.wmsNumber,
        title: d.title,
        revision: d.revision ?? 0,
        status: d.status,
        changeSummary: d.changeSummary,
        preparedByName: d.preparedByName,
        reviewedByName: d.reviewedByName,
        approvedByName: d.approvedByName,
        preparedDate: d.preparedDate,
        effectiveDate: d.effectiveDate,
        createdAt: d.createdAt,
      }));

    return NextResponse.json({ ...currentWms, revisions });
  } catch (error: any) {
    console.error("Failed to fetch WMS details:", error);
    return NextResponse.json({ error: "Failed to fetch WMS details" }, { status: 500 });
  }
}

// There is deliberately no PATCH. A method statement is a controlled
// document: once anyone has signed it, it changes only by a new revision
// (/wms/new?revise=...), which keeps the signed revision and its signatures
// as they were. The old edit route reset the chain in place, deleting the
// signatures already given, and no screen used it.
