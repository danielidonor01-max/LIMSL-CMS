// src/app/api/risks/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { riskRegister, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";

export async function GET() {
  try {
    const list = await db.select().from(riskRegister);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch risk register:", error);
    return NextResponse.json({ error: "Failed to fetch risks", details: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Risk ID required" }, { status: 400 });
    }

    const updated = await db
      .update(riskRegister)
      .set({
        status: body.status,
        actualDateAddressed: body.actualDateAddressed,
        actionToAddressRisk: body.actionToAddressRisk,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(riskRegister.id, body.id))
      .returning();

    // Risk-register changes are compliance evidence — always leave a trail.
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: body.status === "CLOSED" ? "CLOSE" : "UPDATE",
      entityType: "risk_register",
      entityId: String(body.id),
      entityDescription: `Risk item updated${body.status ? ` — status ${body.status}` : ""}`,
    });

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update risk item:", error);
    return NextResponse.json({ error: "Failed to update risk", details: error.message }, { status: 500 });
  }
}
