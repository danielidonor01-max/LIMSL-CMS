// src/app/api/oem/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { oemRegistry, oemInterventions, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to load OEM data:", error);
    return NextResponse.json({ error: "Failed to load OEM data", details: message }, { status: 500 });
  }
}
