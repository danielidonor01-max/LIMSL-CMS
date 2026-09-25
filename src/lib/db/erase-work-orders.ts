// src/lib/db/erase-work-orders.ts
// Clearing every work order, so the year starts again from the plan.
//
// The method statements, hazard analyses and permits were cleared because they
// were written before anything joined them together. The work orders are the
// other half of that: raised against a chain that no longer exists, many of
// them signed against paperwork that has gone. LIMSL's people will raise them
// again through the batches, in order, with the documents behind them.
//
// What goes, and what only loses its link, is decided by one question: does
// the record mean anything without the work order?
//
//   DELETED — it exists only for the job:
//     the work orders, their PM checklists, the hours booked to them, their
//     signatures and seals, reminders about them, and the PM batches that
//     grouped them.
//
//   KEPT, link cleared — it stands on its own:
//     the spares ledger (a part left the shelf whatever it was booked to, and
//     the stock figure depends on the movement staying), breakdown records
//     (the fault happened), and the plan itself.
//
//   NEVER TOUCHED — the audit log. That these work orders existed and were
//     erased is itself on the record, and this writes the line that says so.
//
// Plan rows that a work order or batch had moved on, or that were marked done
// on the strength of one, go back to overdue or scheduled by their date. Rows
// somebody deferred or rescheduled without a work order keep that decision.
//
// Document numbers are NOT reset. WO-2026-0038 follows WO-2026-0037 even though
// 0037 is gone, because the audit log still names 0037 and a number meaning two
// different jobs is the one thing a numbering scheme must never do.
//
//   DATABASE_URL=... npx tsx src/lib/db/erase-work-orders.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/erase-work-orders.ts
import { db } from "@/lib/db";
import {
  workOrders,
  pmChecklists,
  workOrderTimeLogs,
  signoffs,
  documentSeals,
  notifications,
  escalationSnoozes,
  sparePartMovements,
  correctiveMaintenance,
  wmsDocuments,
  jhaDocuments,
  permits,
  maintenanceSchedule,
  pmBatches,
  auditLog,
} from "@/lib/db/schema";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

const count = async (q: Promise<unknown[]>) => (await q).length;

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }

  const wos = await db.select({ id: workOrders.id, n: workOrders.workOrderNumber }).from(workOrders);
  const woIds = wos.map((w) => w.id);
  const checklists = woIds.length
    ? await db.select({ id: pmChecklists.id }).from(pmChecklists).where(inArray(pmChecklists.workOrderId, woIds))
    : [];
  const checklistIds = checklists.map((c) => c.id);
  const batches = await db.select({ id: pmBatches.id }).from(pmBatches);
  const docIds = [...woIds, ...checklistIds];

  const today = new Date().toISOString().slice(0, 10);
  const planRows = await db
    .select({
      id: maintenanceSchedule.id,
      plannedDate: maintenanceSchedule.plannedDate,
      status: maintenanceSchedule.status,
      workOrderId: maintenanceSchedule.workOrderId,
      batchId: maintenanceSchedule.batchId,
    })
    .from(maintenanceSchedule)
    .where(
      or(
        isNotNull(maintenanceSchedule.workOrderId),
        isNotNull(maintenanceSchedule.batchId),
        eq(maintenanceSchedule.status, "COMPLETED"),
      ),
    );

  const n = {
    workOrders: wos.length,
    checklists: checklists.length,
    timeLogs: woIds.length
      ? await count(db.select({ id: workOrderTimeLogs.id }).from(workOrderTimeLogs).where(inArray(workOrderTimeLogs.workOrderId, woIds)))
      : 0,
    signoffs: docIds.length
      ? await count(
          db
            .select({ id: signoffs.id })
            .from(signoffs)
            .where(and(inArray(signoffs.entityType, ["WORK_ORDER", "PM_CHECKLIST"]), inArray(signoffs.entityId, docIds))),
        )
      : 0,
    batches: batches.length,
    movements: woIds.length
      ? await count(db.select({ id: sparePartMovements.id }).from(sparePartMovements).where(inArray(sparePartMovements.workOrderId, woIds)))
      : 0,
    corrective: woIds.length
      ? await count(db.select({ id: correctiveMaintenance.id }).from(correctiveMaintenance).where(inArray(correctiveMaintenance.workOrderId, woIds)))
      : 0,
    planRows: planRows.length,
  };

  console.log(`\nDeleted`);
  console.log(`  work orders .................. ${n.workOrders}`);
  console.log(`  PM checklists ................ ${n.checklists}`);
  console.log(`  hours booked to them ......... ${n.timeLogs}`);
  console.log(`  their signatures ............. ${n.signoffs}`);
  console.log(`  PM batches ................... ${n.batches}`);
  console.log(`\nKept, link to the work order cleared`);
  console.log(`  spares movements ............. ${n.movements}   (stock figures unchanged)`);
  console.log(`  breakdown records ............ ${n.corrective}  (back to "raise the work order")`);
  console.log(`\nPlan rows returned to overdue / scheduled by date ... ${n.planRows}`);
  console.log(`\nNot touched: the audit log. Document numbers are not reset.`);

  if (dryRun) {
    console.log(`\n--dry-run: nothing was written.\n`);
    process.exit(0);
  }

  // Links first, so nothing is left pointing at a row about to disappear.
  if (woIds.length) {
    await db.update(sparePartMovements).set({ workOrderId: null }).where(inArray(sparePartMovements.workOrderId, woIds));
    await db.update(correctiveMaintenance).set({ workOrderId: null }).where(inArray(correctiveMaintenance.workOrderId, woIds));
    await db.update(wmsDocuments).set({ workOrderId: null }).where(inArray(wmsDocuments.workOrderId, woIds));
    await db.update(jhaDocuments).set({ workOrderId: null }).where(inArray(jhaDocuments.workOrderId, woIds));
    await db.update(permits).set({ workOrderId: null }).where(inArray(permits.workOrderId, woIds));
  }

  // The plan: unlinked, and back to what its date says it is.
  for (const r of planRows) {
    await db
      .update(maintenanceSchedule)
      .set({
        workOrderId: null,
        batchId: null,
        responsiblePersonId: null,
        responsiblePersonName: null,
        status: r.plannedDate.slice(0, 10) <= today ? "OVERDUE" : "SCHEDULED",
        completedDate: null,
        daysLate: null,
      })
      .where(eq(maintenanceSchedule.id, r.id));
  }

  // What exists only for the job.
  if (docIds.length) {
    await db
      .delete(signoffs)
      .where(and(inArray(signoffs.entityType, ["WORK_ORDER", "PM_CHECKLIST"]), inArray(signoffs.entityId, docIds)));
    await db
      .delete(documentSeals)
      .where(and(inArray(documentSeals.entityType, ["WORK_ORDER", "PM_CHECKLIST"]), inArray(documentSeals.entityId, docIds)));
    await db
      .delete(notifications)
      .where(and(inArray(notifications.relatedEntityType, ["work_order", "pm_batch"]), inArray(notifications.relatedEntityId, [...docIds, ...batches.map((b) => b.id)])));
    await db.delete(escalationSnoozes).where(inArray(escalationSnoozes.entityId, woIds));
  }
  if (woIds.length) {
    await db.delete(workOrderTimeLogs).where(inArray(workOrderTimeLogs.workOrderId, woIds));
    await db.delete(pmChecklists).where(inArray(pmChecklists.workOrderId, woIds));
  }
  await db.delete(pmBatches);
  await db.delete(workOrders);

  await db.insert(auditLog).values({
    id: nanoid(),
    userId: null,
    userName: "System",
    action: "DELETE",
    entityType: "work_order",
    entityId: null,
    entityDescription:
      `Work order reset: erased ${n.workOrders} work order(s) ` +
      `(${wos.map((w) => w.n).slice(0, 40).join(", ")}${wos.length > 40 ? ", ..." : ""}), ` +
      `${n.checklists} PM checklist(s), ${n.timeLogs} time log(s), ${n.signoffs} signature(s) ` +
      `and ${n.batches} PM batch(es). ${n.movements} spares movement(s) and ${n.corrective} breakdown ` +
      `record(s) kept with the link cleared; ${n.planRows} plan row(s) returned to overdue/scheduled. ` +
      `Document numbers not reset.`,
  });

  const left = await db.select({ c: sql<number>`count(*)::int` }).from(workOrders);
  console.log(`\nDone. ${left[0]?.c ?? 0} work orders remain.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
