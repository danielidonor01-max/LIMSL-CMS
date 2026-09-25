// src/app/api/approvals/route.ts
// Everything waiting on the signed-in person's signature, across every chain.
//
// Read-only and scoped to the caller by construction: the actor comes from the
// session, never from a query string, so there is no version of this route that
// shows one person another person's queue.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { signoffs } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { describeEntities } from "@/lib/signoff/describe";
import { pendingFor, sortInbox, entityHref, entityLabel, type SignoffRow } from "@/lib/signoff/inbox";
import { reconcileWorkOrderApprovals } from "@/lib/work-order-approval";
import { reconcilePermits } from "@/lib/hse/permit-reconcile";


export async function GET() {
  const session = await auth();
  const actor = session?.user as { id?: string; role?: string } | undefined;
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // Reconcile first, exactly as the individual list pages do. Without this the
    // inbox can offer a signature on a permit that expired an hour ago.
    await Promise.all([reconcileWorkOrderApprovals(), reconcilePermits()]);

    // Every row of every chain that still has something pending. The whole chain
    // is needed, not just the pending rows, because a step is only actionable
    // once the steps before it are signed.
    const pendingRows = await db.select().from(signoffs).where(eq(signoffs.status, "PENDING"));
    if (pendingRows.length === 0) return NextResponse.json([]);

    const entityIds = [...new Set(pendingRows.map((r) => r.entityId))];
    const rows = (await db
      .select()
      .from(signoffs)
      .where(inArray(signoffs.entityId, entityIds))) as SignoffRow[];

    const mine = sortInbox(pendingFor(rows, { id: actor.id, role: actor.role }));
    if (mine.length === 0) return NextResponse.json([]);

    // What each document is called and where it is read, from the one
    // describer the flow tracker uses too.
    const described = await describeEntities(mine);
    return NextResponse.json(
      mine.map((m) => {
        const d = described.get(`${m.entityType}:${m.entityId}`);
        return {
          ...m,
          kind: entityLabel(m.entityType),
          href: d?.href ?? entityHref(m.entityType, m.entityId),
          // A record the lookup could not find is still shown. Hiding it would
          // silently drop a signature somebody is waiting on.
          title: d?.title ?? "Record not found",
          code: d?.code ?? null,
        };
      }),
    );
  } catch (error) {
    console.error("Failed to build the approvals inbox:", error);
    return NextResponse.json({ error: "Failed to load approvals" }, { status: 500 });
  }
}
