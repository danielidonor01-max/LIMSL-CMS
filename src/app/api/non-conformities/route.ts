// src/app/api/non-conformities/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nonConformities } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { nanoid } from "nanoid";

export async function GET() {
  try {
    const list = await db.select().from(nonConformities);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch non-conformities:", error);
    return NextResponse.json({ error: "Failed to fetch non-conformities", details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const countResult = await db.select({ value: count() }).from(nonConformities);
    const totalCount = countResult[0]?.value || 0;
    const ncNumber = `NC-2026-${(totalCount + 1).toString().padStart(4, "0")}`;

    const newNc = {
      id: nanoid(),
      ncNumber,
      type: body.type || "AUDIT_FINDING",
      severity: body.severity || "MEDIUM",
      detectedDate: new Date().toISOString().split("T")[0],
      detectedBy: body.detectedBy || "System Audit",
      relatedEntityType: body.relatedEntityType || null,
      relatedEntityId: body.relatedEntityId || null,
      equipmentId: body.equipmentId || null,
      description: body.description,
      rootCause: body.rootCause || "",
      correctiveAction: body.correctiveAction || "",
      responsiblePersonId: body.responsiblePersonId || null,
      targetDate: body.targetDate || null,
      status: "OPEN",
      autoDetected: body.autoDetected || false,
    };

    await db.insert(nonConformities).values(newNc);
    return NextResponse.json(newNc, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create non-conformity:", error);
    return NextResponse.json({ error: "Failed to create non-conformity", details: error.message }, { status: 500 });
  }
}
