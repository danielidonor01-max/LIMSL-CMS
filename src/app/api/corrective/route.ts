// src/app/api/corrective/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { correctiveMaintenance, equipment } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const list = await db.select().from(correctiveMaintenance);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch corrective list:", error);
    return NextResponse.json({ error: "Failed to fetch corrective list", details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Auto-generate CMRF number e.g. CMRF-2026-0001
    const countResult = await db.select({ value: count() }).from(correctiveMaintenance);
    const totalCount = countResult[0]?.value || 0;
    const cmrfNumber = `CMRF-2026-${(totalCount + 1).toString().padStart(4, "0")}`;

    const newCorrective = {
      id: nanoid(),
      cmrfNumber,
      breakdownId: body.breakdownId || `BD-${nanoid(6).toUpperCase()}`,
      equipmentId: body.equipmentId,
      reportedByName: body.reportedByName || "Daniel Idonor",
      reportedDate: body.reportedDate || new Date().toISOString().split("T")[0],
      faultType: body.faultType || "UNKNOWN",
      urgency: body.urgency || "MEDIUM",
      faultDescription: body.faultDescription || "",
      operatingStatusAtFailure: body.operatingStatusAtFailure || "RUNNING",
      observedFault: body.observedFault || "",
      errorCodes: body.errorCodes || "",
      environmentalCondition: body.environmentalCondition || "",
      status: "OPEN",
    };

    // Update equipment status to BROKEN_DOWN or UNDER_MAINTENANCE depending on urgency
    if (body.equipmentId) {
      await db
        .update(equipment)
        .set({
          status: body.urgency === "CRITICAL" || body.urgency === "HIGH" ? "BROKEN_DOWN" : "UNDER_MAINTENANCE",
          updatedAt: new Date().toISOString(),
        })
        .where(eq(equipment.id, body.equipmentId));
    }

    await db.insert(correctiveMaintenance).values(newCorrective);
    return NextResponse.json(newCorrective, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create corrective record:", error);
    return NextResponse.json({ error: "Failed to create corrective record", details: error.message }, { status: 500 });
  }
}
