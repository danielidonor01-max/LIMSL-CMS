// src/app/api/spares/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spareParts, equipment, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { spareRisk } from "@/lib/maintenance/spares";

// Every spare joined to the machine it is held for, with its risk already
// computed, the client should never have to re-derive whether a shortfall
// matters, or it will drift from the register and the KPI layer.
export async function GET() {
  try {
    const rows = await db
      .select({
        id: spareParts.id,
        partNumber: spareParts.partNumber,
        name: spareParts.name,
        description: spareParts.description,
        equipmentId: spareParts.equipmentId,
        quantityOnHand: spareParts.quantityOnHand,
        minimumQuantity: spareParts.minimumQuantity,
        maximumQuantity: spareParts.maximumQuantity,
        unit: spareParts.unit,
        binLocation: spareParts.binLocation,
        supplierName: spareParts.supplierName,
        supplierPartNumber: spareParts.supplierPartNumber,
        leadTimeDays: spareParts.leadTimeDays,
        unitCost: spareParts.unitCost,
        currency: spareParts.currency,
        onOrder: spareParts.onOrder,
        onOrderQuantity: spareParts.onOrderQuantity,
        expectedDate: spareParts.expectedDate,
        notes: spareParts.notes,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
        equipmentCriticality: equipment.criticality,
        equipmentStatus: equipment.status,
      })
      .from(spareParts)
      .leftJoin(equipment, eq(spareParts.equipmentId, equipment.id));

    const withRisk = rows.map((r) => ({
      ...r,
      risk: spareRisk({
        quantityOnHand: r.quantityOnHand,
        minimumQuantity: r.minimumQuantity,
        leadTimeDays: r.leadTimeDays,
        onOrder: r.onOrder,
        equipmentCriticality: r.equipmentCriticality,
        equipmentName: r.equipmentName,
      }),
    }));

    return NextResponse.json(withRisk);
  } catch (error) {
    console.error("Failed to fetch spare parts:", error);
    return NextResponse.json({ error: "Failed to fetch spare parts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const partNumber = String(body.partNumber ?? "").trim();
    const name = String(body.name ?? "").trim();
    if (!partNumber || !name) {
      return NextResponse.json({ error: "A part number and a name are both required." }, { status: 400 });
    }

    const num = (v: unknown, fallback = 0) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    const row = {
      id: nanoid(),
      partNumber,
      name,
      description: body.description || null,
      equipmentId: body.equipmentId || null,
      quantityOnHand: num(body.quantityOnHand),
      minimumQuantity: num(body.minimumQuantity),
      maximumQuantity: body.maximumQuantity ? num(body.maximumQuantity) : null,
      unit: body.unit || "ea",
      binLocation: body.binLocation || null,
      supplierName: body.supplierName || null,
      supplierPartNumber: body.supplierPartNumber || null,
      leadTimeDays: body.leadTimeDays ? num(body.leadTimeDays) : null,
      unitCost: body.unitCost ? num(body.unitCost) : null,
      currency: body.currency || "NGN",
      onOrder: !!body.onOrder,
      onOrderQuantity: body.onOrderQuantity ? num(body.onOrderQuantity) : null,
      expectedDate: body.expectedDate || null,
      notes: body.notes || null,
    };

    await db.insert(spareParts).values(row);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "spare_part",
      entityId: row.id,
      entityDescription: `${row.partNumber} · ${row.name} added to the spares register`,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("Failed to create spare part:", error);
    return NextResponse.json({ error: "Failed to create spare part" }, { status: 500 });
  }
}
