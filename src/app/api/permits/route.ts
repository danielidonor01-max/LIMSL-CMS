// src/app/api/permits/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const list = await db.select().from(permits);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch permit list:", error);
    return NextResponse.json({ error: "Failed to fetch permits", details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Auto-generate permit number e.g. PTW-2026-0001
    const countResult = await db.select({ value: count() }).from(permits);
    const totalCount = countResult[0]?.value || 0;
    const permitNumber = `PTW-2026-${(totalCount + 1).toString().padStart(4, "0")}`;

    const newPermit = {
      id: nanoid(),
      permitNumber,
      workOrderId: body.workOrderId || null,
      equipmentId: body.equipmentId,
      workDescription: body.workDescription,
      hazardsIdentified: body.hazardsIdentified || "",
      controlMeasures: body.controlMeasures || "",
      lotoApplied: body.lotoApplied || false,
      ppeRequired: body.ppeRequired ? JSON.stringify(body.ppeRequired) : "[]",
      areaBarricaded: body.areaBarricaded || false,
      issuedById: body.issuedById || null,
      issuedToId: body.issuedToId || null,
      issuedToName: body.issuedToName || "Maintenance Team",
      issuedDate: new Date().toISOString(),
      expiryDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours default
      status: "ACTIVE",
    };

    await db.insert(permits).values(newPermit);
    return NextResponse.json(newPermit, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create Permit-to-Work:", error);
    return NextResponse.json({ error: "Failed to create Permit-to-Work", details: error.message }, { status: 500 });
  }
}
