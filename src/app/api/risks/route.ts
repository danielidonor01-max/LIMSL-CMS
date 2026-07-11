// src/app/api/risks/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { riskRegister } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update risk item:", error);
    return NextResponse.json({ error: "Failed to update risk", details: error.message }, { status: 500 });
  }
}
