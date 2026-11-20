// src/app/api/work-date-corrections/route.ts
//   GET  ?batchId=  → the batch's completed work with its dates, and every
//                     correction raised against it
//   POST            → raise a correction (Foreman or a manager, not the
//                     Maintenance Manager, who approves it)
// Nothing here moves a date. The Maintenance Manager's signature does
// (applyWorkDateCorrection, from the signature route).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, equipment, maintenanceSchedule, pmBatches, workDateCorrections } from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { WORK_ASSIGN_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { ensureSignoffChain } from "@/lib/signoff/service";
import { isMissingTable } from "@/lib/db/missing-table";
import { WORK_DATE_ENTITY, dayOf, mayRequestWorkDate, validateWorkDateRequest } from "@/lib/maintenance/work-date";

export const dynamic = "force-dynamic";

async function completedRows(batchId: string) {
  return db
    .select({
      id: maintenanceSchedule.id,
      status: maintenanceSchedule.status,
      plannedDate: maintenanceSchedule.plannedDate,
      completedDate: maintenanceSchedule.completedDate,
      recordedDate: maintenanceSchedule.recordedDate,
      equipmentName: equipment.name,
    })
    .from(maintenanceSchedule)
    .leftJoin(equipment, eq(maintenanceSchedule.equipmentId, equipment.id))
    .where(and(eq(maintenanceSchedule.batchId, batchId), eq(maintenanceSchedule.status, "COMPLETED")));
}

export async function GET(request: Request) {
  try {
    const batchId = new URL(request.url).searchParams.get("batchId");
    if (!batchId) return NextResponse.json({ error: "batchId is required" }, { status: 400 });
    const [rows, corrections] = await Promise.all([
      completedRows(batchId),
      db.select().from(workDateCorrections).where(eq(workDateCorrections.batchId, batchId)).orderBy(desc(workDateCorrections.createdAt)),
    ]);
    return NextResponse.json({ rows, corrections, setupRequired: false });
  } catch (error) {
    if (isMissingTable(error)) return NextResponse.json({ rows: [], corrections: [], setupRequired: true });
    console.error("Failed to read work date corrections:", error);
    return NextResponse.json({ error: "Failed to read work date corrections" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(WORK_ASSIGN_ROLES);
    if (gate.res) return gate.res;
    const refused = mayRequestWorkDate(gate.actor?.role, WORK_ASSIGN_ROLES);
    if (refused) return NextResponse.json({ error: refused }, { status: 403 });

    const body = await request.json();
    const batchId = String(body.batchId ?? "");
    const [batch] = await db.select().from(pmBatches).where(eq(pmBatches.id, batchId)).limit(1);
    if (!batch) return NextResponse.json({ error: "PM batch not found" }, { status: 404 });

    const rows = await completedRows(batchId);
    const problem = validateWorkDateRequest({
      workDate: body.workDate,
      evidence: body.evidence,
      reason: body.reason,
      rows,
      today: new Date().toISOString().slice(0, 10),
    });
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const waiting = await db
      .select({ correctionNumber: workDateCorrections.correctionNumber })
      .from(workDateCorrections)
      .where(and(eq(workDateCorrections.batchId, batchId), eq(workDateCorrections.status, "PENDING_APPROVAL")))
      .limit(1);
    if (waiting.length) {
      return NextResponse.json(
        { error: `${waiting[0].correctionNumber} is already waiting for the Maintenance Manager on this batch.` },
        { status: 409 },
      );
    }

    const id = nanoid();
    const correctionNumber = await nextDocNumber("WDC");
    const workDate = String(body.workDate);
    await db.insert(workDateCorrections).values({
      id,
      correctionNumber,
      batchId,
      scheduleIds: JSON.stringify(rows.map((r: { id: string }) => r.id)),
      workDate,
      previousDates: JSON.stringify(rows.map((r: { id: string; completedDate: string | null }) => ({ scheduleId: r.id, date: dayOf(r.completedDate) }))),
      evidence: String(body.evidence).trim().slice(0, 500),
      reason: String(body.reason).trim().slice(0, 1000),
      requestedById: gate.actor?.id ?? null,
      requestedByName: gate.actor?.name ?? null,
    });
    await ensureSignoffChain(WORK_DATE_ENTITY, id, correctionNumber);
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "work_date_correction",
      entityId: id,
      entityDescription: `${correctionNumber} requested on ${batch.batchNumber}: work date ${workDate} for ${rows.length} PM record(s). Evidence: ${String(body.evidence).trim().slice(0, 200)}`,
    });
    return NextResponse.json({ id, correctionNumber }, { status: 201 });
  } catch (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "Work date corrections need a one-off database step (Settings, Database maintenance)." }, { status: 503 });
    }
    console.error("Failed to raise a work date correction:", error);
    return NextResponse.json({ error: "Failed to raise the correction" }, { status: 500 });
  }
}
