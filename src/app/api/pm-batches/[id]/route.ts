// src/app/api/pm-batches/[id]/route.ts
// One PM batch: what it covers, how far along it is, and assigning it.
//
// Assigning a batch is the one action here that carries weight. It is not a
// note on a screen — it puts every machine in the batch on one person's list,
// stamps their name onto each work order underneath, and tells them. That is
// what the shop floor means by "the PM was assigned to him".
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  pmBatches,
  equipment,
  workOrders,
  jhaDocuments,
  permits,
  auditLog,
  pmChecklists,
  workOrderTimeLogs,
} from "@/lib/db/schema";
import { eq, inArray, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { requireRoles } from "@/lib/authz";
import { WORK_ASSIGN_ROLES } from "@/lib/roles";
import { assignPmBatch } from "@/lib/maintenance/pm-batch";
import { pmFlowState } from "@/lib/maintenance/flow";
import { standingPairFor, latestWmsForCategory } from "@/lib/hse/standing-documents";
import { categoryLabelMap } from "@/lib/maintenance/asset-categories";

async function loadBatch(id: string) {
  const [batch] = await db.select().from(pmBatches).where(eq(pmBatches.id, id)).limit(1);
  if (!batch) return null;

  const rawWos = await db
    .select({
      id: workOrders.id,
      workOrderNumber: workOrders.workOrderNumber,
      equipmentId: workOrders.equipmentId,
      title: workOrders.title,
      status: workOrders.status,
      technicianName: workOrders.technicianName,
      startDate: workOrders.startDate,
      completionDate: workOrders.completionDate,
      assetId: equipment.assetId,
      machineName: equipment.name,
      location: equipment.location,
    })
    .from(workOrders)
    .leftJoin(equipment, eq(workOrders.equipmentId, equipment.id))
    .where(eq(workOrders.batchId, id));

  const woIds = rawWos.map((w) => w.id);
  const [checklists, timeLogs] = await Promise.all([
    woIds.length > 0
      ? db
          .select({
            workOrderId: pmChecklists.workOrderId,
            observations: pmChecklists.observations,
            correctiveActionRequired: pmChecklists.correctiveActionRequired,
            actionDescription: pmChecklists.actionDescription,
            technicianName: pmChecklists.technicianName,
            signedAt: pmChecklists.signedAt,
            pmCompleted: pmChecklists.pmCompleted,
            date: pmChecklists.date,
          })
          .from(pmChecklists)
          .where(inArray(pmChecklists.workOrderId, woIds))
      : [],
    woIds.length > 0
      ? db
          .select({
            workOrderId: workOrderTimeLogs.workOrderId,
            startedAt: workOrderTimeLogs.startedAt,
            endedAt: workOrderTimeLogs.endedAt,
          })
          .from(workOrderTimeLogs)
          .where(inArray(workOrderTimeLogs.workOrderId, woIds))
      : [],
  ]);

  const wos = rawWos.map((w) => {
    const chk = checklists.find((c) => c.workOrderId === w.id);
    const logs = timeLogs.filter((l) => l.workOrderId === w.id);
    const starts = logs.map((l) => l.startedAt).filter(Boolean).sort();
    const ends = logs.map((l) => l.endedAt).filter(Boolean).sort();
    const earliestStart = starts[0] ?? w.startDate ?? null;
    const latestEnd = ends[ends.length - 1] ?? w.completionDate ?? chk?.signedAt ?? null;
    return {
      ...w,
      checklist: chk
        ? {
            completed: Boolean(chk.pmCompleted),
            observations: chk.observations ?? null,
            correctiveActionRequired: Boolean(chk.correctiveActionRequired),
            actionDescription: chk.actionDescription ?? null,
            signedAt: chk.signedAt ?? chk.date ?? null,
            technicianName: chk.technicianName ?? null,
          }
        : null,
      startedAt: earliestStart,
      completedAt: latestEnd,
    };
  });

  // The method statement and hazard analysis belong to the CATEGORY, not to
  // this batch. A crane WMS approved in March is the crane WMS in October; the
  // batch does not own one and must not ask for a new one. Looking it up by
  // batch is what made every cycle look as though it needed writing again.
  //
  // The approved revision is what work runs under. If a newer revision is still
  // collecting signatures, that is shown too, so nobody starts a third.
  const pair = await standingPairFor(batch.category);
  const latest = await latestWmsForCategory(batch.category);
  const wms = pair.wms ?? latest;
  const jha = pair.jha;
  const inReview = latest && pair.wms && latest.id !== pair.wms.id ? latest : null;

  // When the method has been revised and its analysis retired with it, the
  // next analysis is a REVISION of that one, not a fresh start. Finding it here
  // lets the page hand it to the form, so the new analysis names the old.
  const [previousJha] = !jha
    ? await db
        .select({ id: jhaDocuments.id, jhaNumber: jhaDocuments.jhaNumber, wmsRevision: jhaDocuments.wmsRevision })
        .from(jhaDocuments)
        .where(and(eq(jhaDocuments.category, batch.category), eq(jhaDocuments.status, "SUPERSEDED")))
        .orderBy(desc(jhaDocuments.revision))
        .limit(1)
    : [];

  // The permit is the one document that IS per batch: it authorises this
  // cycle's work in this cycle's window.
  const [permit] = await db.select().from(permits).where(eq(permits.batchId, id)).limit(1);

  const flow = pmFlowState({
    batchId: batch.id,
    assignedToId: batch.assignedToId,
    workOrderCount: wos.length,
    wmsStatus: wms?.status ?? null,
    // An analysis written against an older revision of the method does not
    // count as done, because the permit route will refuse it.
    jhaStatus: jha && pair.readiness.ok === false && pair.readiness.blockedBy === "JHA_STALE" ? "STALE" : (jha?.status ?? null),
    permitStatus: permit?.status ?? null,
    completed: batch.status === "COMPLETED",
  });

  return {
    ...batch,
    categoryLabel: (await categoryLabelMap())[batch.category] ?? batch.category,
    workOrders: wos,
    wms: wms ?? null,
    wmsInReview: inReview ? { id: inReview.id, wmsNumber: inReview.wmsNumber, revision: inReview.revision, status: inReview.status } : null,
    jha: jha ?? null,
    previousJha: previousJha ?? null,
    readiness: pair.readiness,
    permit: permit ?? null,
    flow,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const batch = await loadBatch(id);
    if (!batch) return NextResponse.json({ error: "PM batch not found" }, { status: 404 });
    return NextResponse.json(batch);
  } catch (error) {
    console.error("Failed to fetch PM batch:", error);
    return NextResponse.json({ error: "Failed to fetch PM batch" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const [batch] = await db.select().from(pmBatches).where(eq(pmBatches.id, id)).limit(1);
    if (!batch) return NextResponse.json({ error: "PM batch not found" }, { status: 404 });

    // ── Assignment ────────────────────────────────────────────────────────
    // Same gate as the schedule: a technician may raise, defer or reschedule
    // their own work, but putting a job on somebody else is a foreman's call
    // and above.
    const touchesAssignment =
      body.assignedToId !== undefined || body.assistantIds !== undefined;
    if (touchesAssignment) {
      const gate = await requireRoles(WORK_ASSIGN_ROLES);
      if (gate.res) return gate.res;

      const assigned = await assignPmBatch({
        batchId: id,
        assignedToId: body.assignedToId === undefined ? batch.assignedToId : body.assignedToId,
        assistantIds: body.assistantIds,
        actor: gate.actor ?? {},
      });
      if (!assigned.ok) return NextResponse.json({ error: assigned.error }, { status: assigned.status });

      return NextResponse.json(await loadBatch(id));
    }

    // ── Everything else ───────────────────────────────────────────────────
    const gate = await requireRoles(WORK_ASSIGN_ROLES);
    if (gate.res) return gate.res;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.status !== undefined) patch.status = body.status;
    if (body.status === "COMPLETED") patch.completedDate = new Date().toISOString().slice(0, 10);

    await db.update(pmBatches).set(patch).where(eq(pmBatches.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "pm_batch",
      entityId: id,
      entityDescription: `${batch.batchNumber} updated`,
    });

    return NextResponse.json(await loadBatch(id));
  } catch (error) {
    console.error("Failed to update PM batch:", error);
    return NextResponse.json({ error: "Failed to update PM batch" }, { status: 500 });
  }
}
