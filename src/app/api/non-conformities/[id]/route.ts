// src/app/api/non-conformities/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nonConformities, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const resolvedParams = await params;
    const body = await request.json();

    const currentRecords = await db
      .select()
      .from(nonConformities)
      .where(eq(nonConformities.id, resolvedParams.id));

    if (currentRecords.length === 0) {
      return NextResponse.json({ error: "Non-conformity not found" }, { status: 404 });
    }

    const nc = currentRecords[0];

    const updateFields: any = {
      status: body.status ?? nc.status,
      rootCause: body.rootCause ?? nc.rootCause,
      correctiveAction: body.correctiveAction ?? nc.correctiveAction,
      closeOutDate: body.status === "CLOSED" ? new Date().toISOString().split("T")[0] : nc.closeOutDate,
      updatedAt: new Date().toISOString(),
    };

    const updated = await db
      .update(nonConformities)
      .set(updateFields)
      .where(eq(nonConformities.id, resolvedParams.id))
      .returning();

    // Every NC state change is auditable evidence — especially the close-out.
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: body.status === "CLOSED" && nc.status !== "CLOSED" ? "CLOSE" : "UPDATE",
      entityType: "non_conformity",
      entityId: nc.id,
      entityDescription:
        body.status && body.status !== nc.status
          ? `NC ${nc.ncNumber} status ${nc.status} → ${body.status}`
          : `NC ${nc.ncNumber} updated (root cause / corrective action)`,
    });

    return NextResponse.json(updated[0] || { success: true });
  } catch (error: any) {
    console.error("Failed to update non-conformity:", error);
    return NextResponse.json({ error: "Failed to update NC", details: error.message }, { status: 500 });
  }
}
