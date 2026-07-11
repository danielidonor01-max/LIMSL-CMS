// src/app/api/equipment/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

export async function GET() {
  try {
    const list = await db.select().from(equipment);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch equipment:", error);
    return NextResponse.json({ error: "Failed to fetch equipment", details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const newAsset = {
      id: nanoid(),
      assetId: body.assetId,
      name: body.name,
      category: body.category,
      location: body.location || "Workshop",
      oem: body.oem || "",
      model: body.model || "",
      serialNumber: body.serialNumber || "",
      commissioningDate: body.commissioningDate || "",
      status: body.status || "OPERATIONAL",
      maintenanceFrequency: body.maintenanceFrequency || "Quarterly",
      criticality: body.criticality || "MEDIUM",
    };

    await db.insert(equipment).values(newAsset);
    return NextResponse.json(newAsset, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create equipment:", error);
    return NextResponse.json({ error: "Failed to create equipment", details: error.message }, { status: 500 });
  }
}
