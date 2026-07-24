// src/app/api/search/route.ts
// Global search across equipment, work orders, corrective cases and WMS.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  workOrders,
  correctiveMaintenance,
  wmsDocuments,
} from "@/lib/db/schema";

type Result = { type: string; label: string; sub: string; href: string };

export async function GET(request: Request) {
  try {
    const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
    if (q.length < 2) return NextResponse.json([]);

    const results: Result[] = [];
    const has = (v: string | null | undefined) => (v || "").toLowerCase().includes(q);

    const eqList = await db.select().from(equipment);
    for (const e of eqList) {
      if (has(e.name) || has(e.assetId) || has(e.oem)) {
        results.push({
          type: "Equipment",
          label: e.name,
          sub: `${e.assetId} · ${e.location ?? ""}`,
          href: `/equipment/${(e.assetId || "").replace(/\//g, "-")}`,
        });
      }
    }

    const wos = await db.select().from(workOrders);
    for (const w of wos) {
      if (has(w.workOrderNumber) || has(w.title)) {
        results.push({
          type: "Work Order",
          label: w.workOrderNumber,
          sub: w.title,
          href: `/work-orders/${w.id}`,
        });
      }
    }

    const cms = await db.select().from(correctiveMaintenance);
    for (const c of cms) {
      if (has(c.cmrfNumber) || has(c.observedFault) || has(c.faultDescription)) {
        results.push({
          type: "Corrective",
          label: c.cmrfNumber,
          sub: c.observedFault || c.faultType || "",
          href: `/corrective/${c.id}`,
        });
      }
    }

    const wms = await db.select().from(wmsDocuments);
    for (const w of wms) {
      if (has(w.wmsNumber) || has(w.title)) {
        results.push({
          type: "WMS",
          label: w.wmsNumber,
          sub: w.title,
          href: `/wms/${w.id}`,
        });
      }
    }

    return NextResponse.json(results.slice(0, 20));
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
