// src/app/api/oem/interventions/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { oemInterventions, oemRegistry } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

// Log an OEM intervention (a vendor call-out / warranty claim).
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.equipmentId && !body.oemId) {
      return NextResponse.json(
        { error: "equipmentId or oemId is required" },
        { status: 400 },
      );
    }

    // Resolve equipmentId from the vendor when only oemId was supplied.
    let equipmentId = body.equipmentId ?? null;
    if (!equipmentId && body.oemId) {
      const [vendor] = await db
        .select()
        .from(oemRegistry)
        .where(eq(oemRegistry.id, body.oemId))
        .limit(1);
      equipmentId = vendor?.equipmentId ?? null;
    }

    const intervention = {
      id: nanoid(),
      oemId: body.oemId || null,
      equipmentId,
      interventionDate: body.interventionDate || new Date().toISOString().slice(0, 10),
      problemDescription: body.problemDescription || "",
      warrantyStatus: body.warrantyStatus || "OUT",
      oemNotified: body.oemNotified ?? true,
      responseTimeHrs: body.responseTimeHrs ?? null,
      resolutionSummary: body.resolutionSummary || null,
      closed: !!body.closed,
    };

    await db.insert(oemInterventions).values(intervention);
    return NextResponse.json(intervention, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to log OEM intervention:", error);
    return NextResponse.json({ error: "Failed to log OEM intervention", details: message }, { status: 500 });
  }
}

// Close out / update an existing intervention.
export async function PATCH(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (body.closed !== undefined) updates.closed = !!body.closed;
    if (body.resolutionSummary !== undefined) updates.resolutionSummary = body.resolutionSummary;
    if (body.responseTimeHrs !== undefined) updates.responseTimeHrs = body.responseTimeHrs;

    await db.update(oemInterventions).set(updates).where(eq(oemInterventions.id, body.id));

    const [updated] = await db
      .select()
      .from(oemInterventions)
      .where(eq(oemInterventions.id, body.id))
      .limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update OEM intervention:", error);
    return NextResponse.json({ error: "Failed to update OEM intervention", details: message }, { status: 500 });
  }
}
