// src/app/api/equipment/[assetId]/components/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { componentRegistry, equipment } from "@/lib/db/schema";
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
    const assetIdKey = resolvedParams.assetId; // E.g. eq-stako-1904 or LEE-PE-1904
    
    // Resolve equipment ID first
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
      .from(componentRegistry)
      .where(eq(componentRegistry.equipmentId, equipmentId));

    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch components:", error);
    return NextResponse.json({ error: "Failed to fetch components", details: error.message }, { status: 500 });
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

    const newComponent = {
      id: nanoid(),
      equipmentId,
      componentTag: body.componentTag,
      name: body.name,
      type: body.type || "ELECTRICAL",
      location: body.location || "",
      schematicReference: body.schematicReference || "",
      manufacturer: body.manufacturer || "",
      modelNumber: body.modelNumber || "",
      technicalSpecs: body.technicalSpecs ? JSON.stringify(body.technicalSpecs) : "{}",
      status: "OPERATIONAL",
    };

    await db.insert(componentRegistry).values(newComponent);
    return NextResponse.json(newComponent, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create component:", error);
    return NextResponse.json({ error: "Failed to create component", details: error.message }, { status: 500 });
  }
}
