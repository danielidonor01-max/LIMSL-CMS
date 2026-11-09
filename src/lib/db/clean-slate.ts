// src/lib/db/clean-slate.ts
// Clearing every document and every signature, so LIMSL's first real test
// starts from the register and the plan and nothing else.
//
// The work orders, method statements, hazard analyses and permits were cleared
// before (erase-work-orders.ts, reset-safety-documents.ts). What was left were
// the stragglers of the same testing: breakdown reports raised to try the
// corrective flow, an incident, a method statement, the category proposals,
// and the signatures and seals on all of them — some on documents that no
// longer exist. A first real test that opens My Approvals onto thirty-six
// stale pending signatures is not a first real test.
//
//   DELETED — documents and everything that only means something with them:
//     every signature and seal; method statements, hazard analyses, permits
//     and their isolation points; work orders, PM checklists, time logs, PM
//     batches; breakdown reports; incidents; asset-category proposals;
//     notifications and escalation snoozes/digests about any of it; and the
//     machine-history lines that name a deleted document.
//
//   NOT RESET — machine status. Several of the breakdown reports describe
//     real faults (a burnt motor, a stalled gantry wheel), and a machine's
//     status is a claim about the machine, not about the paperwork. Erasing
//     the report does not mend the crane, and the public scan passport would
//     tell somebody standing at it that it is safe to use. The machines whose
//     report goes are listed, so the fault can be reported again through the
//     corrective flow, and whoever knows the machine decides its status.
//
//   KEPT — users, the register, categories (as they stand), the annual plan,
//     spares, calibration, training, risks, the legacy machine history, the
//     troubleshooting sessions, and the audit log. The audit log especially:
//     that these records existed and were erased is itself on the record, and
//     this writes the line that says so.
//
// Document numbers are NOT reset, for the reason erase-work-orders.ts gives:
// the audit log still names the old numbers, and a number meaning two
// different documents is the one thing a numbering scheme must never do.
//
// Every deleted row is written to storage/backups/ first (gitignored).
//
//   DATABASE_URL=... npx tsx src/lib/db/clean-slate.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/clean-slate.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import {
  signoffs,
  documentSeals,
  wmsDocuments,
  jhaDocuments,
  permits,
  isolationPoints,
  workOrders,
  pmChecklists,
  workOrderTimeLogs,
  pmBatches,
  correctiveMaintenance,
  safetyIncidents,
  assetCategoryChanges,
  notifications,
  escalationSnoozes,
  escalationDigests,
  equipment,
  equipmentLog,
  maintenanceSchedule,
  auditLog,
} from "@/lib/db/schema";
import { inArray, isNotNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";

const DOWN = ["BROKEN_DOWN", "UNDER_MAINTENANCE", "AWAITING_PARTS"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }

  const snapshot = {
    signoffs: await db.select().from(signoffs),
    documentSeals: await db.select().from(documentSeals),
    wmsDocuments: await db.select().from(wmsDocuments),
    jhaDocuments: await db.select().from(jhaDocuments),
    permits: await db.select().from(permits),
    isolationPoints: await db.select().from(isolationPoints).where(isNotNull(isolationPoints.permitId)),
    workOrders: await db.select().from(workOrders),
    pmChecklists: await db.select().from(pmChecklists),
    workOrderTimeLogs: await db.select().from(workOrderTimeLogs),
    pmBatches: await db.select().from(pmBatches),
    correctiveMaintenance: await db.select().from(correctiveMaintenance),
    safetyIncidents: await db.select().from(safetyIncidents),
    assetCategoryChanges: await db.select().from(assetCategoryChanges),
    notifications: await db.select().from(notifications),
    escalationSnoozes: await db.select().from(escalationSnoozes),
    escalationDigests: await db.select().from(escalationDigests),
  };

  // Every number a deleted document went by, so history lines that name one
  // can be found whichever way they were written.
  const numbers = [
    ...snapshot.wmsDocuments.map((r) => r.wmsNumber),
    ...snapshot.jhaDocuments.map((r) => r.jhaNumber),
    ...snapshot.permits.map((r) => r.permitNumber),
    ...snapshot.workOrders.map((r) => r.workOrderNumber),
    ...snapshot.pmBatches.map((r) => r.batchNumber),
    ...snapshot.correctiveMaintenance.flatMap((r) => [r.cmrfNumber, r.breakdownId]),
    ...snapshot.safetyIncidents.map((r) => r.incidentNumber),
  ].filter((n): n is string => Boolean(n));
  const deletedIds = new Set<string>(
    [
      ...snapshot.wmsDocuments,
      ...snapshot.jhaDocuments,
      ...snapshot.permits,
      ...snapshot.workOrders,
      ...snapshot.pmBatches,
      ...snapshot.correctiveMaintenance,
      ...snapshot.safetyIncidents,
    ].map((r) => r.id),
  );

  const history = await db.select().from(equipmentLog);
  const staleHistory = history.filter(
    (h) =>
      (h.refId && deletedIds.has(h.refId)) ||
      numbers.some((n) => (h.title ?? "").includes(n) || (h.detail ?? "").includes(n)),
  );

  const reported = new Set(snapshot.correctiveMaintenance.map((c) => c.equipmentId));
  const machines = await db.select().from(equipment);
  const orphaned = machines.filter((m) => DOWN.includes(m.status) && reported.has(m.id));

  const planLinks = await db
    .select({ id: maintenanceSchedule.id })
    .from(maintenanceSchedule)
    .where(or(isNotNull(maintenanceSchedule.workOrderId), isNotNull(maintenanceSchedule.batchId)));

  const counts = Object.fromEntries(Object.entries(snapshot).map(([k, v]) => [k, v.length]));
  console.log("\nTo delete");
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k.padEnd(24, ".")} ${v}`);
  console.log(`  ${"equipmentLog (stale)".padEnd(24, ".")} ${staleHistory.length}`);
  for (const h of staleHistory) console.log(`      ${h.occurredAt?.slice(0, 10)}  ${h.title}`);
  console.log(`\nPlan rows unlinked from work orders/batches: ${planLinks.length}`);
  console.log(`\nStill marked down, report being erased; re-report or set status (${orphaned.length}):`);
  for (const m of orphaned) console.log(`  ${m.assetId}  ${m.name}  (${m.status})`);

  if (dryRun) {
    console.log("\n--dry-run: nothing changed.");
    process.exit(0);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), "storage", "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `clean-slate-${stamp}.json`);
  writeFileSync(
    file,
    JSON.stringify({ takenAt: new Date().toISOString(), ...snapshot, equipmentLog: staleHistory }, null, 2),
  );
  console.log(`\nBackup written: ${file}`);

  const ids = <T extends { id: string }>(rows: T[]) => rows.map((r) => r.id);
  const del = async (table: Parameters<typeof db.delete>[0], idCol: Parameters<typeof inArray>[0], rows: { id: string }[]) => {
    if (rows.length) await db.delete(table).where(inArray(idCol, ids(rows)));
  };

  // Children before parents: permits hang off method statements and work
  // orders, checklists and repair records off work orders.
  await db.transaction(async () => {
    await del(isolationPoints, isolationPoints.id, snapshot.isolationPoints);
    await del(permits, permits.id, snapshot.permits);
    await del(jhaDocuments, jhaDocuments.id, snapshot.jhaDocuments);
    await del(pmChecklists, pmChecklists.id, snapshot.pmChecklists);
    await del(workOrderTimeLogs, workOrderTimeLogs.id, snapshot.workOrderTimeLogs);
    await del(correctiveMaintenance, correctiveMaintenance.id, snapshot.correctiveMaintenance);
    if (planLinks.length) {
      await db
        .update(maintenanceSchedule)
        .set({ workOrderId: null, batchId: null })
        .where(inArray(maintenanceSchedule.id, ids(planLinks)));
    }
    await del(workOrders, workOrders.id, snapshot.workOrders);
    await del(pmBatches, pmBatches.id, snapshot.pmBatches);
    await del(wmsDocuments, wmsDocuments.id, snapshot.wmsDocuments);
    await del(safetyIncidents, safetyIncidents.id, snapshot.safetyIncidents);
    await del(assetCategoryChanges, assetCategoryChanges.id, snapshot.assetCategoryChanges);
    await del(signoffs, signoffs.id, snapshot.signoffs);
    await del(documentSeals, documentSeals.id, snapshot.documentSeals);
    await del(notifications, notifications.id, snapshot.notifications);
    await del(escalationSnoozes, escalationSnoozes.id, snapshot.escalationSnoozes);
    await del(escalationDigests, escalationDigests.id, snapshot.escalationDigests);
    await del(equipmentLog, equipmentLog.id, staleHistory);

    const summary = [
      `${counts.signoffs} signatures`,
      `${counts.documentSeals} seals`,
      `${counts.wmsDocuments} WMS`,
      `${counts.jhaDocuments} JHA`,
      `${counts.permits} PTW`,
      `${counts.workOrders} work orders`,
      `${counts.pmBatches} PM batches`,
      `${counts.correctiveMaintenance} breakdown reports (${snapshot.correctiveMaintenance.map((c) => c.cmrfNumber).join(", ") || "none"})`,
      `${counts.safetyIncidents} incidents (${snapshot.safetyIncidents.map((i) => i.incidentNumber).join(", ") || "none"})`,
      `${counts.assetCategoryChanges} category proposals`,
      `${counts.notifications} notifications`,
      `${staleHistory.length} machine-history lines naming them`,
    ].join(", ");
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: null,
      userName: "System (clean slate)",
      action: "DELETE",
      entityType: "system",
      entityId: "clean-slate",
      entityDescription:
        `Clean slate before the first live test. Erased: ${summary}. ` +
        `Machine status was not changed: ${orphaned.length} machine${orphaned.length === 1 ? " is" : "s are"} still marked down with ` +
        `the report behind it erased (${orphaned.map((m) => m.assetId).join(", ") || "none"}), to be re-reported or set by someone who knows the machine. ` +
        `Kept: users, register, categories, annual plan, spares, calibration, training, risks, legacy history and this audit log. ` +
        `Document numbers continue, they are not reused. Backup: storage/backups/clean-slate-${stamp}.json.`,
    });
  });

  console.log("\nDone. The audit log carries the line that says so.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
