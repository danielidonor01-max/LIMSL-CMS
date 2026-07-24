// src/app/api/oem/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { oemRegistry, oemInterventions, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

export async function GET() {
  try {
    const vendors = await db
      .select({
        id: oemRegistry.id,
        equipmentId: oemRegistry.equipmentId,
        vendorName: oemRegistry.vendorName,
        contactPerson: oemRegistry.contactPerson,
        phone: oemRegistry.phone,
        email: oemRegistry.email,
        country: oemRegistry.country,
        warrantyStart: oemRegistry.warrantyStart,
        warrantyEnd: oemRegistry.warrantyEnd,
        warrantyScope: oemRegistry.warrantyScope,
        warrantyActive: oemRegistry.warrantyActive,
        avgResponseTimeHrs: oemRegistry.avgResponseTimeHrs,
        avgSpareLeadTimeDays: oemRegistry.avgSpareLeadTimeDays,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
      })
      .from(oemRegistry)
      .leftJoin(equipment, eq(oemRegistry.equipmentId, equipment.id));

    const interventions = await db.select().from(oemInterventions);

    return NextResponse.json({ vendors, interventions });
  } catch (error) {
    console.error("Failed to load OEM data:", error);
    return NextResponse.json({ error: "Failed to load OEM data" }, { status: 500 });
  }
}

// Register a new OEM / vendor against a piece of equipment, with warranty terms.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.equipmentId || !body.vendorName) {
      return NextResponse.json(
        { error: "equipmentId and vendorName are required" },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const vendor = {
      id: nanoid(),
      equipmentId: body.equipmentId,
      vendorName: body.vendorName,
      contactPerson: body.contactPerson || null,
      phone: body.phone || null,
      email: body.email || null,
      country: body.country || null,
      warrantyStart: body.warrantyStart || null,
      warrantyEnd: body.warrantyEnd || null,
      warrantyScope: body.warrantyScope || null,
      warrantyActive: !!body.warrantyEnd && body.warrantyEnd >= today,
      avgResponseTimeHrs: body.avgResponseTimeHrs ?? null,
      avgSpareLeadTimeDays: body.avgSpareLeadTimeDays ?? null,
      notes: body.notes || null,
    };

    await db.insert(oemRegistry).values(vendor);

    // Mirror the warranty expiry onto the equipment record.
    if (body.warrantyEnd) {
      await db
        .update(equipment)
        .set({ warrantyExpiry: body.warrantyEnd, updatedAt: new Date().toISOString() })
        .where(eq(equipment.id, body.equipmentId));
    }

    return NextResponse.json(vendor, { status: 201 });
  } catch (error) {
    console.error("Failed to register OEM vendor:", error);
    return NextResponse.json({ error: "Failed to register OEM vendor" }, { status: 500 });
  }
}
