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
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { reconcilePermits } from "@/app/api/permits/route";
import { notify } from "@/lib/notifications";
import { logEquipmentEvent } from "@/lib/equipment-log";

// Fetch a single work order with its equipment, linked schedule and PM checklist.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

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

    return NextResponse.json({
      ...wo[0],
      equipment: eq1 ?? null,
      schedule,
      checklist: checklist[0] ?? null,
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

    // Preventive/inspection work orders complete ONLY through the PM checklist —
    // that's where the safety attestations, signatures and schedule roll live.
    // Every other type (corrective, emergency, calibration) completes here with
    // a mandatory summary of what was done, so they can't strand IN_PROGRESS.
    const isPreventive = current.type === "PREVENTIVE" || current.type === "INSPECTION";
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
    // Work orders with no permit at all are unaffected — not every job needs one.
    if (body.status === "IN_PROGRESS") {
      await reconcilePermits();
      const linked = await db.select().from(permits).where(eq(permits.workOrderId, id));
      if (linked.length > 0 && !linked.some((p) => p.status === "ACTIVE")) {
        const blocking = linked[0];
        return NextResponse.json(
          {
            error:
              `Permit ${blocking.permitNumber} is ${blocking.status.replace("_", " ").toLowerCase()} — ` +
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
    if (completing) updates.completionDate = new Date().toISOString().slice(0, 10);
    if (body.priority) updates.priority = body.priority;
    if (body.technicianId !== undefined) updates.technicianId = body.technicianId;
    if (body.technicianName !== undefined) updates.technicianName = body.technicianName;
    if (body.description !== undefined) updates.description = body.description;

    await db.update(workOrders).set(updates).where(eq(workOrders.id, id));

    // Cancelling frees the linked schedule occurrence so a replacement WO can be
    // raised — otherwise the occurrence points at a dead WO forever and its PM
    // silently never happens.
    if (body.status === "CANCELLED" && current.scheduleId) {
      await db
        .update(maintenanceSchedule)
        .set({ workOrderId: null })
        .where(eq(maintenanceSchedule.id, current.scheduleId));
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
        ? `${current.workOrderNumber} completed — ${String(body.completionNotes).slice(0, 120)}`
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

    // Tell the newly-assigned technician — the person actually doing the job was
    // previously the only party never notified. Best-effort.
    if (body.technicianId && body.technicianId !== current.technicianId) {
      try {
        await notify({
          event: "GENERAL",
          title: `Work order assigned to you — ${current.workOrderNumber}`,
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

    const [updated] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update work order:", error);
    return NextResponse.json(
      { error: "Failed to update work order" },
      { status: 500 },
    );
  }
}
