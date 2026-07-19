// src/app/api/schedule/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { maintenanceSchedule, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

// Reschedule an activity (move its planned date) or adjust its remarks. Completion
// is intentionally NOT done here — it flows through the work order + PM checklist
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
      set.plannedDate = body.plannedDate.slice(0, 10);
      set.year = d.getFullYear();
      set.quarter = Math.floor(d.getMonth() / 3) + 1;
      set.month = d.getMonth() + 1;
      set.status = "RESCHEDULED";
    }
    if (typeof body.remarks === "string") set.remarks = body.remarks;
    if (body.responsiblePersonName !== undefined) set.responsiblePersonName = body.responsiblePersonName || null;

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
      entityDescription: set.plannedDate
        ? `Activity rescheduled to ${set.plannedDate}`
        : `Activity updated`,
    });

    const [updated] = await db.select().from(maintenanceSchedule).where(eq(maintenanceSchedule.id, id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update schedule activity:", error);
    return NextResponse.json({ error: "Failed to update activity", details: message }, { status: 500 });
  }
}
