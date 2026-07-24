// src/app/api/equipment/[assetId]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { logEquipmentEvent } from "@/lib/equipment-log";

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
    return NextResponse.json({ error: "Failed to fetch asset detail" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> }
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const resolvedParams = await params;
    const assetIdKey = resolvedParams.assetId;
    const assetIdOriginal = assetIdKey.replace(/-/g, "/");
    const body = await request.json();

    // Only update fields that were actually provided.
    const editable = [
      "assetId",
      "name", "category", "location", "bay", "oem", "model", "serialNumber",
      "commissioningDate", "warrantyExpiry", "status", "criticality",
      "maintenanceFrequency", "lastMaintenanceDate", "lastUsedDate",
      "nextMaintenanceDate", "notes", "requiresCalibration", "requiresPremob",
    ] as const;
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const key of editable) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const [before] = await db.select().from(equipment).where(eq(equipment.assetId, assetIdOriginal)).limit(1);

    const updated = await db
      .update(equipment)
      .set(updates)
      .where(eq(equipment.assetId, assetIdOriginal))
      .returning();

    // Log material lifecycle changes to the machine timeline.
    if (before) {
      try {
        if (body.status !== undefined && body.status !== before.status) {
          await logEquipmentEvent({
            equipmentId: before.id,
            category: "STATUS",
            title: `Status changed: ${before.status?.replace(/_/g, " ")} → ${String(body.status).replace(/_/g, " ")}`,
            source: "AUTO",
            performedById: gate.actor?.id ?? null,
            performedByName: gate.actor?.name ?? null,
          });
        }
        if (body.location !== undefined && body.location !== before.location && body.location) {
          await logEquipmentEvent({
            equipmentId: before.id,
            category: "TRANSFER",
            title: `Relocated: ${before.location || "—"} → ${body.location}`,
            source: "AUTO",
            performedById: gate.actor?.id ?? null,
            performedByName: gate.actor?.name ?? null,
            metadata: { from: before.location, to: body.location },
          });
        }
      } catch (err) {
        console.warn("equipment PATCH: log failed (non-fatal)", err);
      }
    }

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update asset:", error);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
}
