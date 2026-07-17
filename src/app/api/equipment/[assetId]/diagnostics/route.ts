// src/app/api/equipment/[assetId]/diagnostics/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diagnosticGuides, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const resolvedParams = await params;
    const assetIdKey = resolvedParams.assetId;
    
    let equipmentId = assetIdKey;
    const assetIdOriginal = assetIdKey.replace(/-/g, "/");
    const match = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(eq(equipment.assetId, assetIdOriginal));

    if (match.length > 0) {
      equipmentId = match[0].id;
    }

    const list = await db
      .select()
      .from(diagnosticGuides)
      .where(eq(diagnosticGuides.equipmentId, equipmentId));

    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch diagnostics:", error);
    return NextResponse.json({ error: "Failed to fetch diagnostics", details: error.message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const resolvedParams = await params;
    const assetIdKey = resolvedParams.assetId;
    const body = await request.json();

    let equipmentId = assetIdKey;
    const assetIdOriginal = assetIdKey.replace(/-/g, "/");
    const match = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(eq(equipment.assetId, assetIdOriginal));

    if (match.length > 0) {
      equipmentId = match[0].id;
    }

    const newGuide = {
      id: nanoid(),
      equipmentId,
      symptom: body.symptom,
      errorCode: body.errorCode || "",
      componentTag: body.componentTag || "",
      probableCause: body.probableCause,
      diagnosticSteps: JSON.stringify(body.diagnosticSteps || []),
      resolutionAction: body.resolutionAction || "",
      successCount: 0,
    };

    await db.insert(diagnosticGuides).values(newGuide);
    return NextResponse.json(newGuide, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create diagnostic guide:", error);
    return NextResponse.json({ error: "Failed to create diagnostic guide", details: error.message }, { status: 500 });
  }
}
