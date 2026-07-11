// src/app/api/equipment/[assetId]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const resolvedParams = await params;
    const assetIdKey = resolvedParams.assetId; // E.g., LEE-PE-1904
    const assetIdOriginal = assetIdKey.replace(/-/g, "/"); // Convert to LEE/PE/1904

    const records = await db
      .select()
      .from(equipment)
      .where(eq(equipment.assetId, assetIdOriginal));

    if (records.length === 0) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    return NextResponse.json(records[0]);
  } catch (error: any) {
    console.error("Failed to fetch asset detail:", error);
    return NextResponse.json({ error: "Failed to fetch asset detail", details: error.message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const resolvedParams = await params;
    const assetIdKey = resolvedParams.assetId;
    const assetIdOriginal = assetIdKey.replace(/-/g, "/");
    const body = await request.json();

    const updated = await db
      .update(equipment)
      .set({
        status: body.status,
        lastMaintenanceDate: body.lastMaintenanceDate,
        lastUsedDate: body.lastUsedDate,
        nextMaintenanceDate: body.nextMaintenanceDate,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(equipment.assetId, assetIdOriginal))
      .returning();

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update asset:", error);
    return NextResponse.json({ error: "Failed to update asset", details: error.message }, { status: 500 });
  }
}
