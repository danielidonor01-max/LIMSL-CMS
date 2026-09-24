// src/app/api/pm-batches/route.ts
// Raising a PM batch, which is the step that turns a row on the annual plan
// into a job somebody is actually doing.
//
// The plan schedules a category on a date — "CNC light duty, 4 October". On
// that date some number of machines of that category are due. They are one
// job: one person, one method statement, one hazard analysis, one permit. So
// raising the batch collects those schedule rows, gives the job a number, and
// fans out one work order per machine underneath it, because equipment
// history, PM checklists and parts consumption are all per machine.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  pmBatches,
  maintenanceSchedule,
  equipment,
  workOrders,
  wmsDocuments,
  jhaDocuments,
  permits,
  auditLog,
} from "@/lib/db/schema";
import { eq, and, inArray, desc, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { WORK_ASSIGN_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { raiseWorkOrder } from "@/lib/maintenance/raise-work-order";
import { EQUIPMENT_CATEGORY_LABELS } from "@/lib/constants";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await db.select().from(pmBatches).orderBy(desc(pmBatches.plannedDate));
    if (rows.length === 0) return NextResponse.json({ batches: [] });

    const ids = rows.map((b) => b.id);

    // The documents a batch's progress is read from. Fetched in three queries
    // rather than per batch, so a year of batches stays one page load.
    const wos = await db
      .select({
        id: workOrders.id,
        batchId: workOrders.batchId,
        status: workOrders.status,
        workOrderNumber: workOrders.workOrderNumber,
      })
      .from(workOrders)
      .where(inArray(workOrders.batchId, ids));

    const wmsRows = await db
      .select({ id: wmsDocuments.id, batchId: wmsDocuments.batchId, status: wmsDocuments.status, wmsNumber: wmsDocuments.wmsNumber })
      .from(wmsDocuments)
      .where(inArray(wmsDocuments.batchId, ids));

    const jhaRows = await db
      .select({ id: jhaDocuments.id, batchId: jhaDocuments.batchId, status: jhaDocuments.status, jhaNumber: jhaDocuments.jhaNumber })
      .from(jhaDocuments)
      .where(inArray(jhaDocuments.batchId, ids));

    const permitRows = await db
      .select({ id: permits.id, batchId: permits.batchId, status: permits.status, permitNumber: permits.permitNumber })
      .from(permits)
      .where(inArray(permits.batchId, ids));

    const batches = rows.map((b) => {
      const mine = wos.filter((w) => w.batchId === b.id);
      const wms = wmsRows.find((w) => w.batchId === b.id) ?? null;
      const jha = jhaRows.find((j) => j.batchId === b.id) ?? null;
      const permit = permitRows.find((p) => p.batchId === b.id) ?? null;
      return {
        ...b,
        categoryLabel: EQUIPMENT_CATEGORY_LABELS[b.category] ?? b.category,
        machineCount: mine.length,
        workOrdersClosed: mine.filter((w) => w.status === "COMPLETED").length,
        wms,
        jha,
        permit,
      };
    });

    return NextResponse.json({ batches });
  } catch (error) {
    console.error("Failed to fetch PM batches:", error);
    return NextResponse.json({ error: "Failed to fetch PM batches" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Raising a batch commits other people's time, so it sits behind the same
    // gate as assigning work. A technician can raise a work order for a machine
    // in front of them; deciding that five machines are one job is a foreman's
    // call and above.
    const gate = await requireRoles(WORK_ASSIGN_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const category = String(body.category ?? "").trim();
    const plannedDate = String(body.plannedDate ?? "").trim();
    if (!category || !plannedDate) {
      return NextResponse.json(
        { error: "A category and a planned date are required to raise a batch." },
        { status: 400 },
      );
    }

    // The machines in the batch are whatever the plan says is due that day for
    // that category and has not already been rolled into a batch. Read from the
    // plan rather than taken from the request, so a stale screen cannot quietly
    // leave a machine out of the permit that is supposed to cover it.
    const due = await db
      .select({
        scheduleId: maintenanceSchedule.id,
        equipmentId: maintenanceSchedule.equipmentId,
        activityType: maintenanceSchedule.activityType,
        taskDescription: maintenanceSchedule.taskDescription,
        status: maintenanceSchedule.status,
        assetId: equipment.assetId,
        name: equipment.name,
        category: equipment.category,
      })
      .from(maintenanceSchedule)
      .innerJoin(equipment, eq(maintenanceSchedule.equipmentId, equipment.id))
      .where(
        and(
          eq(maintenanceSchedule.plannedDate, plannedDate),
          eq(equipment.category, category),
          isNull(maintenanceSchedule.batchId),
        ),
      );

    const machines = due.filter(
      (r) => r.status !== "COMPLETED" && r.status !== "CANCELLED" && (r.activityType === "PM" || r.activityType === "INS"),
    );

    if (machines.length === 0) {
      return NextResponse.json(
        {
          error:
            "Nothing is due for that category on that date, or it has already been rolled into a batch.",
        },
        { status: 409 },
      );
    }

    const categoryLabel = EQUIPMENT_CATEGORY_LABELS[category] ?? category;
    const id = nanoid();
    const batchNumber = await nextDocNumber("PMB");
    const activityType = machines.every((m) => m.activityType === "INS") ? "INS" : "PM";
    const title = `${activityType === "INS" ? "Inspection" : "PM"}, ${categoryLabel}, ${plannedDate}`;

    await db.insert(pmBatches).values({
      id,
      batchNumber,
      title,
      category,
      plannedDate,
      year: Number(plannedDate.slice(0, 4)) || new Date().getFullYear(),
      activityType,
      status: "PLANNED",
      createdBy: gate.actor?.id ?? null,
    });

    // One work order per machine, all pointing at the batch.
    const raised: Array<{ id: string; workOrderNumber: string; equipmentId: string }> = [];
    for (const m of machines) {
      const wo = await raiseWorkOrder({
        type: activityType === "INS" ? "INSPECTION" : "PREVENTIVE",
        equipmentId: m.equipmentId,
        title: `${activityType === "INS" ? "Inspection" : "PM"}, ${m.assetId} ${m.name}`,
        description: m.taskDescription || `Planned ${activityType} under batch ${batchNumber}.`,
        plannedDate,
        scheduleId: m.scheduleId,
        batchId: id,
        actor: gate.actor ?? {},
        origin: `raised under PM batch ${batchNumber}`,
      });
      raised.push({ id: wo.id, workOrderNumber: wo.workOrderNumber, equipmentId: m.equipmentId });

      await db
        .update(maintenanceSchedule)
        .set({ batchId: id })
        .where(eq(maintenanceSchedule.id, m.scheduleId));
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "pm_batch",
      entityId: id,
      entityDescription:
        `${batchNumber}, ${title}, ${machines.length} machine${machines.length === 1 ? "" : "s"}, ` +
        `work orders ${raised.map((r) => r.workOrderNumber).join(", ")}`,
    });

    return NextResponse.json(
      { id, batchNumber, title, machineCount: machines.length, workOrders: raised },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to raise PM batch:", error);
    return NextResponse.json({ error: "Failed to raise PM batch" }, { status: 500 });
  }
}
