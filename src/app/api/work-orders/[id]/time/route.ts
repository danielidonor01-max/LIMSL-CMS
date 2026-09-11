// src/app/api/work-orders/[id]/time/route.ts
// Clocking on and off a job.
//
// The decisions all live in `@/lib/maintenance/time-log` and are tested there.
// This route's job is to establish who is asking, read the stretches that
// already exist, do what the decision says, and write one row.
//
// The actor comes from the session, never from the body. A route that accepted
// a user id would let one technician book hours against another's name on a
// record that feeds a costing.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workOrders, workOrderTimeLogs, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import {
  canClockIn,
  canClockOff,
  openSessionFor,
  totalLoggedHours,
  hoursByPerson,
  runningSessions,
} from "@/lib/maintenance/time-log";

async function sessionsFor(workOrderId: string) {
  return db
    .select()
    .from(workOrderTimeLogs)
    .where(eq(workOrderTimeLogs.workOrderId, workOrderId));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sessions = await sessionsFor(id);
    return NextResponse.json({
      sessions: sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      totalHours: totalLoggedHours(sessions),
      byPerson: hoursByPerson(sessions),
      running: runningSessions(sessions),
    });
  } catch (error) {
    console.error("Failed to read work order time log:", error);
    return NextResponse.json({ error: "Failed to read the time log" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();
    const action = body.action === "off" ? "off" : "on";

    const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, id)).limit(1);
    if (!wo) return NextResponse.json({ error: "Work order not found" }, { status: 404 });

    // Booking time to a closed job would change a figure that has already been
    // signed for. The record is finished; a correction belongs in a note.
    if (wo.status === "COMPLETED" || wo.status === "CANCELLED") {
      return NextResponse.json(
        { error: `This work order is ${wo.status.toLowerCase()}. Time cannot be booked to it.` },
        { status: 409 },
      );
    }

    const actorId = gate.actor?.id ?? null;
    if (!actorId) {
      return NextResponse.json({ error: "Could not identify who is clocking on." }, { status: 401 });
    }

    const sessions = await sessionsFor(id);

    if (action === "on") {
      const decision = canClockIn(sessions, actorId);
      if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 409 });

      const now = new Date().toISOString();
      await db.insert(workOrderTimeLogs).values({
        id: nanoid(),
        workOrderId: id,
        userId: actorId,
        userName: gate.actor?.name ?? null,
        startedAt: now,
        endedAt: null,
        note: typeof body.note === "string" ? body.note.slice(0, 500) : null,
      });

      // Clocking on IS starting the job. Leaving the work order OPEN while
      // somebody is stood at the machine makes the board lie about what is
      // happening on the floor.
      if (wo.status === "OPEN") {
        await db
          .update(workOrders)
          .set({
            status: "IN_PROGRESS",
            startDate: wo.startDate ?? now.slice(0, 10),
            updatedAt: now,
          })
          .where(eq(workOrders.id, id));
      }
    } else {
      const decision = canClockOff(sessions, actorId);
      if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: 409 });

      const open = openSessionFor(sessions, actorId)!;
      // Only touch the note when one is supplied. Writing undefined over a note
      // left at clock-on would erase what somebody recorded about the stretch.
      const closing: { endedAt: string; note?: string } = { endedAt: new Date().toISOString() };
      if (typeof body.note === "string" && body.note.trim()) {
        closing.note = body.note.slice(0, 500);
      }
      await db.update(workOrderTimeLogs).set(closing).where(eq(workOrderTimeLogs.id, open.id));
    }

    const after = await sessionsFor(id);
    const totalHours = totalLoggedHours(after);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: actorId,
      userName: gate.actor?.name ?? null,
      action: "UPDATE",
      entityType: "work_order",
      entityId: id,
      entityDescription:
        action === "on"
          ? `${gate.actor?.name ?? "Someone"} clocked on to ${wo.workOrderNumber}`
          : `${gate.actor?.name ?? "Someone"} clocked off ${wo.workOrderNumber}, ${totalHours}h booked so far`,
    });

    return NextResponse.json({
      ok: true,
      totalHours,
      byPerson: hoursByPerson(after),
      running: runningSessions(after),
    });
  } catch (error) {
    console.error("Failed to record work order time:", error);
    return NextResponse.json({ error: "Failed to record the time" }, { status: 500 });
  }
}
