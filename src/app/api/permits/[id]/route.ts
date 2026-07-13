// src/app/api/permits/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, equipment, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { PERMIT_WRITE_ROLES } from "@/lib/roles";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const [permit] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    if (!permit) {
      return NextResponse.json({ error: "Permit not found" }, { status: 404 });
    }
    const [eq1] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, permit.equipmentId))
      .limit(1);
    return NextResponse.json({ ...permit, equipment: eq1 ?? null });
  } catch (error: any) {
    console.error("Failed to fetch permit:", error);
    return NextResponse.json({ error: "Failed to fetch permit", details: error.message }, { status: 500 });
  }
}

// Transition a permit's lifecycle: CLOSED (work complete) or CANCELLED.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoles(PERMIT_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const status = body.status as string | undefined;
    if (!status || !["CLOSED", "CANCELLED", "EXPIRED", "ACTIVE"].includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const updates: Record<string, unknown> = { status };
    if (status === "CLOSED" || status === "CANCELLED") {
      updates.closedAt = new Date().toISOString();
    }

    await db.update(permits).set(updates).where(eq(permits.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userName: gate.actor?.name || "System",
      action: status === "CANCELLED" ? "CANCEL" : "UPDATE",
      entityType: "permit",
      entityId: id,
      entityDescription: `Permit-to-Work set to ${status}`,
    });

    const [updated] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update permit:", error);
    return NextResponse.json({ error: "Failed to update permit", details: error.message }, { status: 500 });
  }
}
