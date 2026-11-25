// src/app/api/work-orders/[id]/resubmit/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workOrders, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { resetSignoffChain } from "@/lib/signoff/service";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    // Only a rejected work order goes back for approval. Resubmitting one that
    // is still being signed would throw away signatures that were given to it
    // as it stands, the Factory Manager's included.
    if (wo.status !== "REJECTED") {
      return NextResponse.json(
        { error: "Only a rejected work order can be resubmitted for approval." },
        { status: 409 },
      );
    }

    const { voided } = await resetSignoffChain("WORK_ORDER", id, wo.workOrderNumber);

    await db
      .update(workOrders)
      .set({
        status: "PENDING_APPROVAL",
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workOrders.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "RESUBMIT",
      entityType: "work_order",
      entityId: id,
      entityDescription: `${wo.workOrderNumber} resubmitted for approval by ${gate.actor?.name ?? "User"}`,
      changes: JSON.stringify({
        voidedSignatures: voided.map((s) => ({
          step: s.roleLabel,
          status: s.status,
          by: s.signedByName,
          role: s.signedByRole,
          at: s.signedAt,
          comments: s.comments,
        })),
      }),
    });

    const [updated] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error: any) {
    console.error("Failed to resubmit work order:", error);
    return NextResponse.json({ error: "Failed to resubmit work order" }, { status: 500 });
  }
}
