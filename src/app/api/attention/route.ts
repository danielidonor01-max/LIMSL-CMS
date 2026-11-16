// src/app/api/attention/route.ts
// The modules with something waiting on the signed-in person, for the sidebar's
// green dots. Read-only and scoped to the caller by construction, like the
// approvals inbox it shares its rule with: the actor comes from the session.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { signoffs, pmBatches, workOrders, permits } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { pendingFor, type SignoffRow } from "@/lib/signoff/inbox";
import { standingPairFor } from "@/lib/hse/standing-documents";
import { batchAuthorisation } from "@/lib/work-order-approval";
import { attentionModules } from "@/lib/attention";
import { JHA_WRITE_ROLES, PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { canSignChainStep, WMS_CHAIN } from "@/lib/signoff/chains";

const OPEN_BATCH = ["PLANNED", "ASSIGNED", "IN_PROGRESS"];
const OPEN_WORK = ["OPEN", "IN_PROGRESS"];
const LIVE_PERMIT = (s: string) => s !== "REJECTED" && s !== "CANCELLED" && s !== "CLOSED" && s !== "EXPIRED";

export async function GET() {
  const session = await auth();
  const actor = session?.user as { id?: string; role?: string } | undefined;
  if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = actor.role ?? "";

  try {
    // Signatures waiting on this person: the same rule as My Approvals.
    const pending = await db.select({ entityId: signoffs.entityId }).from(signoffs).where(eq(signoffs.status, "PENDING"));
    const entityIds = [...new Set(pending.map((p) => p.entityId))];
    const rows = entityIds.length
      ? ((await db.select().from(signoffs).where(inArray(signoffs.entityId, entityIds))) as SignoffRow[])
      : [];
    const mine = pendingFor(rows, { id: actor.id, role });

    // Documents still to be raised for the open batches.
    // The WMS's originator, by the SOP: whoever may sign its first step.
    const canWriteWms = canSignChainStep(role, "WMS", { stepOrder: 1, role: WMS_CHAIN[0].role });
    const canWriteJha = JHA_WRITE_ROLES.includes(role);
    const canIssuePermit = PERMIT_ISSUE_ROLES.includes(role);
    let batchesNeedingWms = 0;
    let batchesNeedingJha = 0;
    let batchesNeedingPermit = 0;
    if (canWriteWms || canWriteJha || canIssuePermit) {
      const open = await db.select().from(pmBatches).where(inArray(pmBatches.status, OPEN_BATCH));
      if (open.length) {
        const ids = open.map((b) => b.id);
        const [lines, batchPermits] = await Promise.all([
          db
            .select({ batchId: workOrders.batchId, status: workOrders.status, workOrderNumber: workOrders.workOrderNumber })
            .from(workOrders)
            .where(inArray(workOrders.batchId, ids)),
          db.select({ batchId: permits.batchId, status: permits.status }).from(permits).where(inArray(permits.batchId, ids)),
        ]);
        const pairs = new Map<string, Awaited<ReturnType<typeof standingPairFor>>>();
        for (const c of new Set(open.map((b) => b.category))) pairs.set(c, await standingPairFor(c));

        for (const b of open) {
          const pair = pairs.get(b.category)!;
          const stale = pair.readiness.ok === false && pair.readiness.blockedBy === "JHA_STALE";
          if (!pair.wms) {
            batchesNeedingWms++;
            continue;
          }
          if (pair.wms.status !== "APPROVED") continue;
          if (!pair.jha || pair.jha.status === "REJECTED" || pair.jha.status === "SUPERSEDED" || stale) {
            batchesNeedingJha++;
            continue;
          }
          if (pair.jha.status !== "APPROVED") continue;
          const authorised = batchAuthorisation(lines.filter((l) => l.batchId === b.id)).ok;
          const hasPermit = batchPermits.some((p) => p.batchId === b.id && LIVE_PERMIT(p.status));
          if (authorised && !hasPermit) batchesNeedingPermit++;
        }
      }
    }

    // Work on this person's own list.
    const [myWos, myBatches] = await Promise.all([
      db
        .select({ id: workOrders.id })
        .from(workOrders)
        .where(and(eq(workOrders.technicianId, actor.id), inArray(workOrders.status, OPEN_WORK))),
      db
        .select({ id: pmBatches.id })
        .from(pmBatches)
        .where(and(eq(pmBatches.assignedToId, actor.id), inArray(pmBatches.status, ["ASSIGNED", "IN_PROGRESS"]))),
    ]);

    const modules = attentionModules({
      signoffs: mine.map((m) => m.entityType),
      batchesNeedingWms,
      batchesNeedingJha,
      batchesNeedingPermit,
      myOpenWork: myWos.length + myBatches.length,
      canWriteWms,
      canWriteJha,
      canIssuePermit,
    });
    return NextResponse.json({ modules });
  } catch (err) {
    console.error("attention failed", err);
    return NextResponse.json({ modules: [] });
  }
}
