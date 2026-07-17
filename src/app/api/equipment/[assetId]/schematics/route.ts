// src/app/api/equipment/[assetId]/schematics/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { schematicDiagrams, equipment } from "@/lib/db/schema";
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
      .from(schematicDiagrams)
      .where(eq(schematicDiagrams.equipmentId, equipmentId));

    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch schematics:", error);
    return NextResponse.json({ error: "Failed to fetch schematics", details: error.message }, { status: 500 });
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

    const newSchematic = {
      id: nanoid(),
      equipmentId,
      title: body.title,
      type: body.type || "ELECTRICAL",
      sheetNumber: body.sheetNumber || "",
      fileUrl: body.fileUrl || "/vercel.svg",
    };

    await db.insert(schematicDiagrams).values(newSchematic);
    return NextResponse.json(newSchematic, { status: 201 });
  } catch (error: any) {
    console.error("Failed to upload schematic:", error);
    return NextResponse.json({ error: "Failed to upload schematic", details: error.message }, { status: 500 });
  }
}
