// src/app/api/schedule/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maintenanceSchedule, auditLog, equipment, workOrders, pmBatches } from "@/lib/db/schema";
import { raisePmBatch, assignPmBatch } from "@/lib/maintenance/pm-batch";

const safeIdList = (raw: string): string[] => {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};
import { eq, and, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES, WORK_ASSIGN_ROLES } from "@/lib/roles";
import { validateDeferral } from "@/lib/maintenance/deferral";
import { toWorkingDay } from "@/lib/maintenance/working-days";
import { notify } from "@/lib/notifications";

// Reschedule an activity (move its planned date) or adjust its remarks. Completion
// is intentionally NOT done here, it flows through the work order + PM checklist
// so the sign-off and recurrence stay auditable.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [row] = await db.select().from(maintenanceSchedule).where(eq(maintenanceSchedule.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "Activity not found" }, { status: 404 });
    if (row.status === "COMPLETED") {
      return NextResponse.json({ error: "A completed activity cannot be rescheduled." }, { status: 409 });
    }

    const set: Partial<typeof maintenanceSchedule.$inferInsert> = {};
    let movedFrom: string | null = null;
    if (body.plannedDate) {
      const d = new Date(`${String(body.plannedDate).slice(0, 10)}T00:00:00`);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid planned date" }, { status: 400 });
      }
      // A reschedule must move work to a future date. Backdating would flip the
      // row straight back to OVERDUE at best, and at worst be used to massage
      // the overdue list. Reconciliation also re-evaluates RESCHEDULED rows, so
      // rescheduling can never hide an activity from the overdue KPI.
      const today = new Date().toISOString().slice(0, 10);
      if (String(body.plannedDate).slice(0, 10) < today) {
        return NextResponse.json({ error: "The new planned date must be today or later." }, { status: 400 });
      }
      // Nobody is on the floor at the weekend, so a reschedule onto one moves
      // to the next working day, the same rule the annual plan follows. Said
      // back in the response so the screen can tell the person who picked it.
      const asked = String(body.plannedDate).slice(0, 10);
      const planned = toWorkingDay(asked);
      if (planned !== asked) movedFrom = asked;
      const pd = new Date(`${planned}T00:00:00`);
      set.plannedDate = planned;
      set.year = pd.getFullYear();
      set.quarter = Math.floor(pd.getMonth() / 3) + 1;
      set.month = pd.getMonth() + 1;
      set.status = "RESCHEDULED";
    }
    // ── Deferral ──────────────────────────────────────────────────────────
    // A deferral is a RISK ACCEPTED, and someone must own it. Until now there
    // was no legitimate deferral path at all, so real deferrals happened by
    // silence: the activity simply went overdue and stayed there, with no
    // justification, no approver and no date anyone had agreed to revisit.
    if (body.action === "defer") {
      const check = validateDeferral({
        reason: body.deferredReason,
        reviewDate: body.deferredReviewDate,
        today: new Date().toISOString().slice(0, 10),
      });
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

      set.status = "DEFERRED";
      set.deferredReason = check.reason;
      set.deferredById = gate.actor?.id ?? null;
      set.deferredByName = gate.actor?.name ?? null;
      set.deferredAt = new Date().toISOString();
      set.deferredReviewDate = check.reviewDate;
    }

    if (typeof body.remarks === "string") set.remarks = body.remarks;

    // ── Assignment ────────────────────────────────────────────────────────
    // Deciding who does a job is a supervisory act, and this route was letting
    // anybody with maintenance write access do it — which includes every
    // technician. A technician may still raise a work order, reschedule and
    // defer through this same route; naming somebody else is the one thing
    // they may not do. Gated here rather than only in the page, because a page
    // that hides a control the route still accepts is not a permission.
    const touchesAssignment =
      body.responsiblePersonId !== undefined ||
      body.responsiblePersonName !== undefined ||
      body.assistantIds !== undefined;
    if (touchesAssignment && !WORK_ASSIGN_ROLES.includes(gate.actor?.role ?? "")) {
      return NextResponse.json(
        { error: "Assigning work to somebody else is done by a foreman or above." },
        { status: 403 },
      );
    }

    if (body.responsiblePersonName !== undefined) set.responsiblePersonName = body.responsiblePersonName || null;
    // Reassignment has to move the ID too. The name alone is a label; the ID is
    // what escalations.ts uses to reach the person, and it skips any activity
    // that has none.
    if (body.responsiblePersonId !== undefined) set.responsiblePersonId = body.responsiblePersonId || null;
    let addedHelpers: string[] = [];
    if (body.assistantIds !== undefined) {
      const raw: unknown[] = Array.isArray(body.assistantIds) ? body.assistantIds : [];
      const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
      // The accountable person is not also a helper, otherwise they appear twice
      // and would be notified twice.
      const lead = set.responsiblePersonId ?? row.responsiblePersonId;
      const next = [...new Set(ids)].filter((personId) => personId !== lead);
      let before: string[] = [];
      try {
        const parsed = JSON.parse(row.assistantIds ?? "[]");
        if (Array.isArray(parsed)) before = parsed.filter((v): v is string => typeof v === "string");
      } catch {
        before = [];
      }
      addedHelpers = next.filter((personId) => !before.includes(personId));
      set.assistantIds = JSON.stringify(next);
    }

    // If applyToCategory is requested, find all schedule rows for that category and date
    let targetIds = [id];
    const [eqItem] = await db
      .select({ category: equipment.category })
      .from(equipment)
      .where(eq(equipment.id, row.equipmentId))
      .limit(1);

    if (body.applyToCategory && eqItem?.category) {
      const catRows = await db
        .select({ id: maintenanceSchedule.id })
        .from(maintenanceSchedule)
        .innerJoin(equipment, eq(maintenanceSchedule.equipmentId, equipment.id))
        .where(
          and(
            eq(maintenanceSchedule.plannedDate, row.plannedDate),
            eq(equipment.category, eqItem.category),
            eq(maintenanceSchedule.activityType, row.activityType),
          ),
        );
      if (catRows.length > 0) {
        targetIds = catRows.map((c) => c.id);
      }
    }

    await db.update(maintenanceSchedule).set(set).where(inArray(maintenanceSchedule.id, targetIds));

    // If this schedule row is associated with a batch and assignment was updated, sync child work orders
    if (row.batchId && touchesAssignment) {
      const woIds = (
        await db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.batchId, row.batchId))
      ).map((w) => w.id);
      if (woIds.length > 0) {
        await db
          .update(workOrders)
          .set({
            technicianId: set.responsiblePersonId || null,
            technicianName: set.responsiblePersonName || null,
            assistantIds: set.assistantIds,
          })
          .where(inArray(workOrders.id, woIds));
      }
    }

    // Putting a person on a category's PM raises its batch (LIMSL, November
    // 2026). A name against plan rows with no batch is a job with nothing to
    // hang the method statement, hazard analysis and permit off, so it could
    // never start. The batch's work orders still cannot start until those
    // documents are approved: raising it is the start of the paperwork, not
    // permission to pick up a spanner.
    let batch: { id: string; batchNumber: string; raised: boolean; workOrders: number } | null = null;
    if (
      body.applyToCategory &&
      set.responsiblePersonId &&
      eqItem?.category &&
      (row.activityType === "PM" || row.activityType === "INS") &&
      row.status !== "COMPLETED"
    ) {
      const actor = gate.actor ?? {};
      let batchId = row.batchId;
      let raisedNow = false;
      if (!batchId) {
        const raised = await raisePmBatch({ category: eqItem.category, plannedDate: row.plannedDate, actor });
        if (raised.ok) {
          batchId = raised.id;
          raisedNow = true;
        } else if (raised.status !== 409) {
          console.warn("schedule assign: could not raise the batch", raised.error);
        }
      }
      if (batchId) {
        const assigned = await assignPmBatch({
          batchId,
          assignedToId: String(set.responsiblePersonId),
          assistantIds: set.assistantIds ? safeIdList(set.assistantIds) : undefined,
          actor,
        });
        const [b] = await db.select({ batchNumber: pmBatches.batchNumber }).from(pmBatches).where(eq(pmBatches.id, batchId)).limit(1);
        if (assigned.ok && b) batch = { id: batchId, batchNumber: b.batchNumber, raised: raisedNow, workOrders: assigned.workOrders };
      }
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "maintenance_schedule",
      entityId: id,
      entityDescription: set.status === "DEFERRED"
        ? `Activity DEFERRED to review ${set.deferredReviewDate}, ${set.deferredReason}`
        : set.plannedDate
          ? `Activity rescheduled to ${set.plannedDate}`
          : targetIds.length > 1
            ? `Assigned category schedule (${targetIds.length} machines)`
            : `Activity updated`,
    });

    // Being given work you were not told about is how a PM goes quietly overdue.
    // Best-effort, an assignment must not fail because email is down.
    const newLead =
      set.responsiblePersonId && set.responsiblePersonId !== row.responsiblePersonId
        ? [String(set.responsiblePersonId)]
        : [];
    // With a batch, the lead has already been told by the batch, with a link to
    // the job itself; telling them twice teaches people to ignore both.
    const recipients = batch ? addedHelpers : [...newLead, ...addedHelpers];
    if (recipients.length) {
      try {
        const when = set.plannedDate ?? row.plannedDate;
        await notify({
          event: "GENERAL",
          title: newLead.length
            ? `${row.activityType} assigned to you, due ${when}`
            : `You are on a ${row.activityType} due ${when}`,
          body: targetIds.length > 1
            ? `Assigned to ${targetIds.length} machines for planned ${row.activityType} schedule.`
            : row.taskDescription || `Scheduled ${row.activityType} activity.`,
          linkPath: "/schedule",
          relatedEntityType: "maintenance_schedule",
          relatedEntityId: id,
          userIds: recipients,
        });
      } catch (err) {
        console.warn("schedule assign: notify failed", err);
      }
    }

    const [updated] = await db.select().from(maintenanceSchedule).where(eq(maintenanceSchedule.id, id)).limit(1);
    return NextResponse.json({
      ...updated,
      ...(movedFrom ? { movedFromWeekend: movedFrom } : {}),
      ...(batch ? { batch } : {}),
    });
  } catch (error) {
    console.error("Failed to update schedule activity:", error);
    return NextResponse.json({ error: "Failed to update activity" }, { status: 500 });
  }
}
