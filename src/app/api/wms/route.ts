// src/app/api/wms/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { wmsDocuments } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const list = await db.select().from(wmsDocuments);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch WMS list:", error);
    return NextResponse.json({ error: "Failed to fetch WMS list", details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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
      preparedById: body.preparedById || null,
      preparedByName: body.preparedByName || "Daniel Idonor",
      preparedDate: new Date().toISOString().split("T")[0],
    };

    await db.insert(wmsDocuments).values(newWms);
    return NextResponse.json(newWms, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create WMS document:", error);
    return NextResponse.json({ error: "Failed to create WMS", details: error.message }, { status: 500 });
  }
}
