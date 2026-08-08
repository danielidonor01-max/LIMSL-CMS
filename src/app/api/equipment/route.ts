// src/app/api/equipment/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { suggestedPmFrequency } from "@/lib/maintenance/adherence";
import { normaliseAssetId } from "@/lib/asset-id";

export async function GET() {
  try {
    const list = await db.select().from(equipment);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch equipment:", error);
    return NextResponse.json({ error: "Failed to fetch equipment" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "An equipment name is required." }, { status: 400 });

    // Canonicalise before the uniqueness check, so "lee/pe/7" and "LEE/PE/0007"
    // cannot enter the register as two different assets.
    const id = normaliseAssetId(String(body.assetId ?? ""));
    if (!id.ok) return NextResponse.json({ error: id.error }, { status: 400 });

    const [clash] = await db
      .select({ name: equipment.name })
      .from(equipment)
      .where(eq(equipment.assetId, id.assetId))
      .limit(1);
    if (clash) {
      return NextResponse.json(
        { error: `${id.assetId} is already the asset ID for "${clash.name}". Generate the next free code.` },
        { status: 409 },
      );
    }

    const newAsset = {
      id: nanoid(),
      assetId: id.assetId,
      name,
      category: body.category,
      location: body.location || "Workshop",
      bay: body.bay || null,
      oem: body.oem || "",
      model: body.model || "",
      serialNumber: body.serialNumber || "",
      commissioningDate: body.commissioningDate || "",
      status: body.status || "OPERATIONAL",
      // The old literal "Quarterly" matched none of the uppercase frequency
      // keys the adherence window and recurrence tables use.
      maintenanceFrequency: body.maintenanceFrequency || suggestedPmFrequency(body.criticality),
      criticality: body.criticality || "MEDIUM",
      notes: body.notes || null,
    };

    await db.insert(equipment).values(newAsset);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "equipment",
      entityId: newAsset.id,
      entityDescription: `${newAsset.assetId} · ${newAsset.name} added to the asset register`,
    });

    return NextResponse.json(newAsset, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create equipment:", error);
    return NextResponse.json({ error: "Failed to create equipment" }, { status: 500 });
  }
}
