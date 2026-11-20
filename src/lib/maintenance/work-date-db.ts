// src/lib/maintenance/work-date-db.ts
// Applies an approved work date correction. Called once, from the signature
// route, when the Maintenance Manager signs. The rules are in ./work-date.ts.
import { db } from "@/lib/db";
import { auditLog, maintenanceSchedule, workDateCorrections, workOrders } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { daysBetween } from "@/lib/maintenance/adherence";
import { dayOf } from "@/lib/maintenance/work-date";

export async function applyWorkDateCorrection(id: string, actor: { id: string | null; name: string | null }): Promise<number> {
  const [c] = await db.select().from(workDateCorrections).where(eq(workDateCorrections.id, id)).limit(1);
  if (!c || c.status !== "PENDING_APPROVAL") return 0;

  let ids: string[] = [];
  try {
    const parsed = JSON.parse(c.scheduleIds);
    if (Array.isArray(parsed)) ids = parsed.filter((v): v is string => typeof v === "string");
  } catch {
    ids = [];
  }
  const rows = ids.length ? await db.select().from(maintenanceSchedule).where(inArray(maintenanceSchedule.id, ids)) : [];
  const done = rows.filter((r: typeof maintenanceSchedule.$inferSelect) => r.status === "COMPLETED");
  const woIds = done.map((r: { workOrderId: string | null }) => r.workOrderId).filter((v: string | null): v is string => !!v);
  const wos = woIds.length
    ? await db.select({ id: workOrders.id, createdAt: workOrders.createdAt }).from(workOrders).where(inArray(workOrders.id, woIds))
    : [];
  const enteredOn = new Map(wos.map((w: { id: string; createdAt: string }) => [w.id, dayOf(w.createdAt)]));
  const now = new Date().toISOString();

  await db.transaction(async (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => {
    for (const r of done) {
      await tx
        .update(maintenanceSchedule)
        .set({
          // When the system was told. Kept from the first correction on: it is
          // the date the record was entered, and that never moves.
          recordedDate: r.recordedDate ?? (r.workOrderId ? enteredOn.get(r.workOrderId) : null) ?? dayOf(r.completedDate) ?? null,
          completedDate: c.workDate,
          daysLate: Math.max(0, daysBetween(r.plannedDate, c.workDate)),
          workDateCorrectionId: c.id,
        })
        .where(eq(maintenanceSchedule.id, r.id));
    }
    await tx
      .update(workDateCorrections)
      .set({ status: "APPLIED", appliedAt: now, approvedById: actor.id, approvedByName: actor.name, rowsAffected: done.length })
      .where(eq(workDateCorrections.id, c.id));
    await tx.insert(auditLog).values({
      id: nanoid(),
      userId: actor.id,
      userName: actor.name || "System",
      action: "APPROVE",
      entityType: "work_date_correction",
      entityId: c.id,
      entityDescription: `${c.correctionNumber} applied: work date of ${done.length} PM record(s) set to ${c.workDate}. Evidence: ${c.evidence}`,
      changes: JSON.stringify(done.map((r: typeof maintenanceSchedule.$inferSelect) => ({ scheduleId: r.id, from: dayOf(r.completedDate), to: c.workDate }))),
    });
  });
  return done.length;
}
