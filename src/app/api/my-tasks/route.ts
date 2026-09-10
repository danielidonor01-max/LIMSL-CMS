// src/app/api/my-tasks/route.ts
// One technician's own work: the work orders assigned to them and the scheduled
// activities they are responsible for.
//
// Scoped to the caller from the session, never from a query string. There is no
// version of this route that returns somebody else's queue.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { workOrders, maintenanceSchedule, equipment } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { reconcileWorkOrderApprovals, approvalBlockMessage } from "@/lib/work-order-approval";
import type { Task } from "@/lib/my-tasks";

const DONE_WO = ["COMPLETED", "CANCELLED"];
const DONE_SCHEDULE = ["COMPLETED", "CANCELLED"];

function assistants(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const session = await auth();
  const actor = session?.user as { id?: string; name?: string } | undefined;
  if (!actor?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const me = actor.id;

  try {
    await reconcileWorkOrderApprovals();

    const [wos, schedule, eqList] = await Promise.all([
      db.select().from(workOrders),
      db.select().from(maintenanceSchedule),
      db.select().from(equipment),
    ]);
    const eqName = new Map(eqList.map((e) => [e.id, e.name]));

    const tasks: Task[] = [];

    for (const w of wos) {
      if (DONE_WO.includes(w.status)) continue;
      const lead = w.technicianId === me;
      const assisting = !lead && assistants(w.assistantIds).includes(me);
      if (!lead && !assisting) continue;

      tasks.push({
        kind: "WORK_ORDER",
        id: w.id,
        code: w.workOrderNumber,
        title: w.title,
        href: `/work-orders/${w.id}`,
        dueDate: w.plannedDate ?? null,
        status: w.status,
        assisting,
        // Shown rather than filtered out. A technician who cannot see the job
        // that is waiting on a signature has no way to know to go and chase it.
        blockedReason:
          w.status === "PENDING_APPROVAL" ? approvalBlockMessage(w.workOrderNumber) : null,
      });
    }

    for (const s of schedule) {
      if (DONE_SCHEDULE.includes(s.status)) continue;
      if (s.responsiblePersonId !== me) continue;

      tasks.push({
        kind: "SCHEDULE",
        id: s.id,
        code: s.activityType ?? null,
        title: s.taskDescription || eqName.get(s.equipmentId ?? "") || "Scheduled activity",
        href: "/schedule",
        dueDate: s.plannedDate ?? null,
        status: s.status,
      });
    }

    return NextResponse.json({ tasks, firstName: (actor.name ?? "").trim().split(/\s+/)[0] ?? null });
  } catch (error) {
    console.error("Failed to build the technician task list:", error);
    return NextResponse.json({ error: "Failed to load your work" }, { status: 500 });
  }
}
