// src/app/api/schedule/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maintenanceSchedule, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { validateDeferral } from "@/lib/maintenance/deferral";
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
      set.plannedDate = body.plannedDate.slice(0, 10);
      set.year = d.getFullYear();
      set.quarter = Math.floor(d.getMonth() / 3) + 1;
      set.month = d.getMonth() + 1;
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

    if (Object.keys(set).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await db.update(maintenanceSchedule).set(set).where(eq(maintenanceSchedule.id, id));

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
          : `Activity updated`,
    });

    // Being given work you were not told about is how a PM goes quietly overdue.
    // Best-effort, an assignment must not fail because email is down.
    const newLead =
      set.responsiblePersonId && set.responsiblePersonId !== row.responsiblePersonId
        ? [String(set.responsiblePersonId)]
        : [];
    const recipients = [...newLead, ...addedHelpers];
    if (recipients.length) {
      try {
        const when = set.plannedDate ?? row.plannedDate;
        await notify({
          event: "GENERAL",
          title: newLead.length
            ? `${row.activityType} assigned to you, due ${when}`
            : `You are on a ${row.activityType} due ${when}`,
          body: row.taskDescription || `Scheduled ${row.activityType} activity.`,
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
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Failed to update schedule activity:", error);
    return NextResponse.json({ error: "Failed to update activity" }, { status: 500 });
  }
}
