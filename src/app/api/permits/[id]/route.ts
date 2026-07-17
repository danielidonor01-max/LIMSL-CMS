// src/app/api/permits/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permits, equipment, auditLog, wmsDocuments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { PERMIT_WRITE_ROLES } from "@/lib/roles";
import { getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";
import { reconcilePermits } from "../route";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await reconcilePermits();

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

    const approvalChain = await getSignoffChain("PERMIT", id);
    const closeoutChain = await getSignoffChain("PERMIT_CLOSEOUT", id);

    // Supporting documents: the linked WMS (if any).
    let wms = null;
    if (permit.wmsId) {
      const [w] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, permit.wmsId)).limit(1);
      wms = w ? { id: w.id, wmsNumber: w.wmsNumber, title: w.title, status: w.status } : null;
    }

    return NextResponse.json({
      ...permit,
      equipment: eq1 ?? null,
      wms,
      approval: chainSummary(approvalChain),
      closeout: closeoutChain.length ? chainSummary(closeoutChain) : null,
    });
  } catch (error: any) {
    console.error("Failed to fetch permit:", error);
    return NextResponse.json({ error: "Failed to fetch permit", details: error.message }, { status: 500 });
  }
}

// Cancel a permit. Approval and close-out are NOT actions here — they are driven
// by the sign-off chains (see reconcilePermits), so a permit can never be marked
// approved or closed without the required signatures.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoles(PERMIT_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    if (body.status !== "CANCELLED") {
      return NextResponse.json(
        {
          error:
            "Only cancellation is a manual action. A permit becomes ACTIVE when its sign-off chain is complete, and CLOSED when its close-out chain is signed.",
        },
        { status: 400 },
      );
    }

    const [permit] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    if (!permit) return NextResponse.json({ error: "Permit not found" }, { status: 404 });
    if (permit.status === "CLOSED" || permit.status === "CANCELLED") {
      return NextResponse.json(
        { error: `Permit is already ${permit.status.toLowerCase()}.` },
        { status: 409 },
      );
    }

    await db
      .update(permits)
      .set({ status: "CANCELLED", closedAt: new Date().toISOString() })
      .where(eq(permits.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CANCEL",
      entityType: "permit",
      entityId: id,
      entityDescription: `Permit ${permit.permitNumber} cancelled`,
    });

    const [updated] = await db.select().from(permits).where(eq(permits.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to update permit:", error);
    return NextResponse.json({ error: "Failed to update permit", details: error.message }, { status: 500 });
  }
}
