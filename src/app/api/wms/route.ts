// src/app/api/wms/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wmsDocuments, equipment } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { WMS_WRITE_ROLES } from "@/lib/roles";

export async function GET() {
  try {
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
    return NextResponse.json({ error: "Failed to fetch WMS list", details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(WMS_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    
    // Auto-generate WMS document number e.g. WMS-2026-0001
    const countResult = await db.select({ value: count() }).from(wmsDocuments);
    const totalCount = countResult[0]?.value || 0;
    const wmsNumber = `WMS-2026-${(totalCount + 1).toString().padStart(4, "0")}`;

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
    return NextResponse.json(newWms, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create WMS document:", error);
    return NextResponse.json({ error: "Failed to create WMS", details: error.message }, { status: 500 });
  }
}
