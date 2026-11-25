// src/app/api/work-orders/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  workOrders,
  equipment,
  maintenanceSchedule,
  pmChecklists,
  permits,
  auditLog,
  pmBatches,
  signoffs,
  correctiveMaintenance,
} from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { loadReadiness } from "@/lib/maintenance/work-readiness-db";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { reconcilePermits } from "@/app/api/permits/route";
import { notify } from "@/lib/notifications";
import { logEquipmentEvent } from "@/lib/equipment-log";
import { applyDerivedStatus } from "@/lib/equipment-status";
import { clockEveryoneOff } from "@/lib/maintenance/time-log-db";
import { reconcileWorkOrderApprovals, approvalBlockMessage } from "@/lib/work-order-approval";
import { workOrderMoveError } from "@/lib/maintenance/work-order-status";

// Fetch a single work order with its equipment, linked schedule and PM checklist.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    await reconcileWorkOrderApprovals();

    const wo = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (wo.length === 0) {
      return NextResponse.json({ error: "Work order not found" }, { status: 404 });
    }

    const [eq1] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, wo[0].equipmentId))
      .limit(1);

    let schedule = null;
    if (wo[0].scheduleId) {
      const s = await db
        .select()
        .from(maintenanceSchedule)
        .where(eq(maintenanceSchedule.id, wo[0].scheduleId))
        .limit(1);
      schedule = s[0] ?? null;
    }

    const checklist = await db
      .select()
      .from(pmChecklists)
      .where(eq(pmChecklists.workOrderId, id))
      .limit(1);

    // The batch a line belongs to. On a batch raised as one work order the
    // approval is the batch's, so the page shows that chain, not one of its own.
    let batch = null;
    if (wo[0].batchId) {
      const [b] = await db
        .select({ id: pmBatches.id, batchNumber: pmBatches.batchNumber, workOrderNumber: pmBatches.workOrderNumber })
        .from(pmBatches)
        .where(eq(pmBatches.id, wo[0].batchId))
        .limit(1);
      batch = b ?? null;
    }

    return NextResponse.json({
      ...wo[0],
      equipment: eq1 ?? null,
      schedule,
      checklist: checklist[0] ?? null,
      batch,
    });
  } catch (error) {
    console.error("Failed to fetch work order:", error);
    return NextResponse.json(
      { error: "Failed to fetch work order" },
      { status: 500 },
    );
  }
}

// Update a work order (status transitions: start, cancel, etc.).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [current] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!current) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

    if (body.status !== undefined) {
      const refused = workOrderMoveError(current.status, String(body.status), current.workOrderNumber);
      if (refused) return NextResponse.json({ error: refused }, { status: 409 });
    }
    // A finished job's assignment is part of its record.
    const touchesAssignment =
      body.technicianId !== undefined || body.technicianName !== undefined || body.assistantIds !== undefined;
    if (touchesAssignment && (current.status === "COMPLETED" || current.status === "CANCELLED")) {
      return NextResponse.json(
        { error: `${current.workOrderNumber} is ${current.status.toLowerCase()}. Its assignment cannot change.` },
        { status: 409 },
      );
    }

    // Preventive/inspection work orders complete ONLY through the PM checklist,     // that's where the safety attestations, signatures and schedule roll live.
    // Every other type (corrective, emergency, calibration) completes here with
    // a mandatory summary of what was done, so they can't strand IN_PROGRESS.
    const isPreventive = current.type === "PREVENTIVE" || current.type === "INSPECTION";
    // "Start Work" moves the job to In Progress, which is starting work just as
    // clocking on is. It was a second way in that checked nothing, so it answers
    // to the same rule: approved work order, approved WMS and JHA, a signed
    // permit in force, and today revalidated on it.
    if (body.status === "IN_PROGRESS" && current.status !== "IN_PROGRESS") {
      const readiness = await loadReadiness(id);
      if (readiness && !readiness.ok) {
        return NextResponse.json(
          { error: `Work cannot start yet. ${readiness.firstBlocker?.detail ?? ""}`.trim(), readiness },
          { status: 409 },
        );
      }
    }

    const completing = body.status === "COMPLETED" && current.status !== "COMPLETED";
    if (completing && isPreventive) {
      return NextResponse.json(
        { error: "Preventive/inspection work orders are completed by submitting the PM checklist." },
        { status: 409 },
      );
    }
    if (completing && !String(body.completionNotes ?? "").trim()) {
      return NextResponse.json(
        { error: "Describe the work performed before completing this work order." },
        { status: 400 },
      );
    }

    // Work may not begin under an unapproved permit. If a PTW has been raised for
    // this work order, it must be fully signed (ACTIVE) before the job starts.
    // Work orders with no permit at all are unaffected, not every job needs one.
    // Work may not begin on a work order management has not approved. The work
    // order IS the authorisation to commence, so starting one that is still
    // PENDING_APPROVAL is doing the job before it was sanctioned.
    if (body.status === "IN_PROGRESS" && current.status === "PENDING_APPROVAL") {
      return NextResponse.json(
        { error: approvalBlockMessage(current.workOrderNumber) },
        { status: 409 },
      );
    }

    if (body.status === "IN_PROGRESS") {
      await reconcilePermits();
      // A batch line is covered by the batch's permit, which names the
      // batch's first line as its work order.
      const linked = await db
        .select()
        .from(permits)
        .where(current.batchId ? or(eq(permits.workOrderId, id), eq(permits.batchId, current.batchId)) : eq(permits.workOrderId, id));
      if (linked.length > 0 && !linked.some((p) => p.status === "ACTIVE")) {
        const blocking = linked[0];
        return NextResponse.json(
          {
            error:
              `Permit ${blocking.permitNumber} is ${blocking.status.replace("_", " ").toLowerCase()}, ` +
              `work cannot begin until the Permit-to-Work is signed and approved.`,
          },
          { status: 409 },
        );
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (body.status) updates.status = body.status;
    if (body.status === "IN_PROGRESS" && !body.startDate) {
      updates.startDate = new Date().toISOString().slice(0, 10);
    }
    if (completing) {
      updates.completionDate = new Date().toISOString().slice(0, 10);
      // Real labour hours. actualDuration was written by NO path, so the
      // maintenance backlog KPI was openWOs x 2h, an assumption presented as
      // a man-hour measurement in management review. Optional but requested at
      // completion, and now the only thing that makes backlog-vs-capacity real.
      const hours = Number(body.actualDuration);
      if (Number.isFinite(hours) && hours > 0) updates.actualDuration = hours;
    }
    if (body.priority) updates.priority = body.priority;
    if (body.technicianId !== undefined) updates.technicianId = body.technicianId;
    if (body.technicianName !== undefined) updates.technicianName = body.technicianName;
    if (body.description !== undefined) updates.description = body.description;

    // Others on the job. The assigned technician stays single because one name
    // has to answer for the work; helpers are recorded so they can be reached
    // and so the history shows who was actually on the machine.
    let addedHelpers: string[] = [];
    if (body.assistantIds !== undefined) {
      const lead = body.technicianId !== undefined ? body.technicianId : current.technicianId;
      const raw: unknown[] = Array.isArray(body.assistantIds) ? body.assistantIds : [];
      const ids = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
      const next = [...new Set(ids)].filter((personId) => personId !== lead);
      let before: string[] = [];
      try {
        const parsed = JSON.parse(current.assistantIds ?? "[]");
        if (Array.isArray(parsed)) before = parsed.filter((v): v is string => typeof v === "string");
      } catch {
        before = [];
      }
      addedHelpers = next.filter((personId) => !before.includes(personId));
      updates.assistantIds = JSON.stringify(next);
    }

    await db.update(workOrders).set(updates).where(eq(workOrders.id, id));

    // Completing or cancelling the job ends everybody's time on it. Time cannot
    // be booked to a closed job, so a clock left running would run for ever.
    let clockedOff = 0;
    if ((body.status === "COMPLETED" || body.status === "CANCELLED") && body.status !== current.status) {
      clockedOff = await clockEveryoneOff(db, id);
    }

    // A job starting, finishing or being cancelled changes what the machine
    // is doing, so its status is re-derived by the one writer. Without this a
    // repair whose fault was closed before its work order was completed left
    // the machine "under maintenance" for good. Best-effort, like every caller.
    if (body.status && body.status !== current.status && current.equipmentId) {
      try {
        await applyDerivedStatus(current.equipmentId);
      } catch (err) {
        console.warn("work-order: status derivation failed (non-fatal)", err);
      }
    }

    // Cancelling frees the linked schedule occurrence so a replacement WO can be
    // raised, otherwise the occurrence points at a dead WO forever and its PM
    // silently never happens.
    if (body.status === "CANCELLED" && current.scheduleId) {
      await db
        .update(maintenanceSchedule)
        .set({ workOrderId: null })
        .where(eq(maintenanceSchedule.id, current.scheduleId));
    }

    // A cancelled work order cannot be revalidated: a new one is raised. So
    // its unsigned approval steps go (signed ones stay as the record), and a
    // breakdown it belonged to is freed, which puts that repair back on
    // "raise the work order" instead of pointing at a dead one.
    if (body.status === "CANCELLED" && body.status !== current.status) {
      await db
        .delete(signoffs)
        .where(and(eq(signoffs.entityType, "WORK_ORDER"), eq(signoffs.entityId, id), eq(signoffs.status, "PENDING")));
      await db
        .update(correctiveMaintenance)
        .set({ workOrderId: null, updatedAt: new Date().toISOString() })
        .where(eq(correctiveMaintenance.workOrderId, id));
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: completing ? "COMPLETE" : body.status === "CANCELLED" ? "CANCEL" : "UPDATE",
      entityType: "work_order",
      entityId: id,
      changes: JSON.stringify(updates),
      entityDescription: completing
        ? `${current.workOrderNumber} completed, ${String(body.completionNotes).slice(0, 120)}`
        : `${current.workOrderNumber} updated`,
    });

    // Completion of a non-PM job is a machine-history event (PM completions are
    // logged by the checklist flow).
    if (completing) {
      try {
        await logEquipmentEvent({
          equipmentId: current.equipmentId,
          category: current.type === "CALIBRATION" ? "CALIBRATION" : "CM",
          title: `${current.type} work order ${current.workOrderNumber} completed`,
          detail: String(body.completionNotes).slice(0, 500),
          refType: "work_order",
          refId: id,
          href: `/work-orders/${id}`,
          source: "AUTO",
          performedById: gate.actor?.id ?? null,
          performedByName: gate.actor?.name ?? null,
        });
      } catch (err) {
        console.warn("work-order complete: equipment log failed (non-fatal)", err);
      }
    }

    // Tell the newly-assigned technician, the person actually doing the job was
    // previously the only party never notified. Best-effort.
    if (body.technicianId && body.technicianId !== current.technicianId) {
      try {
        await notify({
          event: "GENERAL",
          title: `Work order assigned to you, ${current.workOrderNumber}`,
          body: `${current.title}. Priority ${(updates.priority as string) ?? current.priority}. Open the work order for details.`,
          linkPath: `/work-orders/${id}`,
          relatedEntityType: "work_order",
          relatedEntityId: id,
          userIds: [String(body.technicianId)],
        });
      } catch (err) {
        console.warn("work-order assign: notify failed", err);
      }
    }

    if (addedHelpers.length) {
      try {
        await notify({
          event: "GENERAL",
          title: `You are on work order ${current.workOrderNumber}`,
          body: `${current.title}. Working with ${(updates.technicianName as string) ?? current.technicianName ?? "the assigned technician"}.`,
          linkPath: `/work-orders/${id}`,
          relatedEntityType: "work_order",
          relatedEntityId: id,
          userIds: addedHelpers,
        });
      } catch (err) {
        console.warn("work-order helpers: notify failed", err);
      }
    }

    const [updated] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    return NextResponse.json({ ...updated, clockedOff });
  } catch (error) {
    console.error("Failed to update work order:", error);
    return NextResponse.json(
      { error: "Failed to update work order" },
      { status: 500 },
    );
  }
}
