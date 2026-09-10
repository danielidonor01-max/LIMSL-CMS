// src/app/api/approvals/route.ts
// Everything waiting on the signed-in person's signature, across every chain.
//
// Read-only and scoped to the caller by construction: the actor comes from the
// session, never from a query string, so there is no version of this route that
// shows one person another person's queue.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  signoffs,
  workOrders,
  correctiveMaintenance,
  wmsDocuments,
  jhaDocuments,
  permits,
  nonConformities,
  procedureRevisions,
  pmChecklists,
} from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { pendingFor, sortInbox, entityHref, entityLabel, type SignoffRow } from "@/lib/signoff/inbox";
import { reconcileWorkOrderApprovals } from "@/lib/work-order-approval";
import { reconcilePermits } from "@/lib/hse/permit-reconcile";

// A PM checklist is reached through its work order rather than by its own id,
// so a describer can override where the row points.
type Describer = { title: string; code: string | null; href?: string };

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

    // One lookup per entity type, only for the types actually present.
    const need = (t: string) => [...new Set(mine.filter((m) => m.entityType === t).map((m) => m.entityId))];
    const describers = new Map<string, Describer>();
    const put = (type: string, id: string, d: Describer) => describers.set(`${type}:${id}`, d);

    const load = async <T extends { id: string }>(
      type: string,
      table: any,
      describe: (r: T) => Describer,
    ) => {
      const ids = need(type);
      if (!ids.length) return;
      const found = (await db.select().from(table).where(inArray(table.id, ids))) as T[];
      for (const r of found) put(type, r.id, describe(r));
    };

    await Promise.all([
      load("WORK_ORDER", workOrders, (r: any) => ({ title: r.title, code: r.workOrderNumber })),
      load("CORRECTIVE", correctiveMaintenance, (r: any) => ({
        title: r.faultDescription || r.equipmentName || "Corrective record",
        code: r.cmrfNumber,
      })),
      load("WMS", wmsDocuments, (r: any) => ({ title: r.title, code: r.wmsNumber })),
      load("JHA", jhaDocuments, (r: any) => ({ title: r.title, code: r.jhaNumber })),
      load("PERMIT", permits, (r: any) => ({ title: r.workDescription, code: r.permitNumber })),
      load("PERMIT_CLOSEOUT", permits, (r: any) => ({ title: r.workDescription, code: r.permitNumber })),
      load("NON_CONFORMITY", nonConformities, (r: any) => ({ title: r.description, code: r.ncNumber })),
      load("PROCEDURE", procedureRevisions, (r: any) => ({
        title: r.title || "Maintenance procedure",
        code: r.revision ? `Rev ${r.revision}` : null,
      })),
      // The checklist's own id is not a route. It is filled in against the work
      // order that raised it, so that is where the signature is given.
      load("PM_CHECKLIST", pmChecklists, (r: any) => ({
        title: "PM checklist",
        code: r.date ?? null,
        href: `/work-orders/${r.workOrderId}/pm-checklist`,
      })),
    ]);

    return NextResponse.json(
      mine.map((m) => {
        const d = describers.get(`${m.entityType}:${m.entityId}`);
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
