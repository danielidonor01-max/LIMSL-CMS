// src/app/api/search/route.ts
// Global search across equipment, work orders, corrective cases and WMS.
// Filtering happens IN SQL (ILIKE + LIMIT, selected columns only) — this runs on
// every keystroke of the typeahead, so it must never load whole tables into JS.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  workOrders,
  correctiveMaintenance,
  wmsDocuments,
} from "@/lib/db/schema";
import { ilike, or } from "drizzle-orm";

type Result = { type: string; label: string; sub: string; href: string };

const PER_ENTITY = 6;

export async function GET(request: Request) {
  try {
    const q = (new URL(request.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json([]);
    // Escape LIKE wildcards so a literal "%" in the query can't blow up the scan.
    const pat = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

    const [eqRows, woRows, cmRows, wmsRows] = await Promise.all([
      db
        .select({ name: equipment.name, assetId: equipment.assetId, location: equipment.location })
        .from(equipment)
        .where(or(ilike(equipment.name, pat), ilike(equipment.assetId, pat), ilike(equipment.oem, pat)))
        .limit(PER_ENTITY),
      db
        .select({ id: workOrders.id, workOrderNumber: workOrders.workOrderNumber, title: workOrders.title })
        .from(workOrders)
        .where(or(ilike(workOrders.workOrderNumber, pat), ilike(workOrders.title, pat)))
        .limit(PER_ENTITY),
      db
        .select({
          id: correctiveMaintenance.id,
          cmrfNumber: correctiveMaintenance.cmrfNumber,
          observedFault: correctiveMaintenance.observedFault,
          faultType: correctiveMaintenance.faultType,
        })
        .from(correctiveMaintenance)
        .where(
          or(
            ilike(correctiveMaintenance.cmrfNumber, pat),
            ilike(correctiveMaintenance.observedFault, pat),
            ilike(correctiveMaintenance.faultDescription, pat),
          ),
        )
        .limit(PER_ENTITY),
      db
        .select({ id: wmsDocuments.id, wmsNumber: wmsDocuments.wmsNumber, title: wmsDocuments.title })
        .from(wmsDocuments)
        .where(or(ilike(wmsDocuments.wmsNumber, pat), ilike(wmsDocuments.title, pat)))
        .limit(PER_ENTITY),
    ]);

    const results: Result[] = [
      ...eqRows.map((e) => ({
        type: "Equipment",
        label: e.name,
        sub: `${e.assetId} · ${e.location ?? ""}`,
        href: `/equipment/${(e.assetId || "").replace(/\//g, "-")}`,
      })),
      ...woRows.map((w) => ({
        type: "Work Order",
        label: w.workOrderNumber,
        sub: w.title,
        href: `/work-orders/${w.id}`,
      })),
      ...cmRows.map((c) => ({
        type: "Corrective",
        label: c.cmrfNumber,
        sub: c.observedFault || c.faultType || "",
        href: `/corrective/${c.id}`,
      })),
      ...wmsRows.map((w) => ({
        type: "WMS",
        label: w.wmsNumber,
        sub: w.title,
        href: `/wms/${w.id}`,
      })),
    ];

    return NextResponse.json(results.slice(0, 20));
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
