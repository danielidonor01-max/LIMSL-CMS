// src/lib/db/mark-pm-defect-fixed.ts
// Re-reads one PM checklist's defect as "fixed during the PM" (LIMSL, 16 Nov 2026).
//
// Until the checklist asked "no defect / fixed during this PM / still needs a
// repair", the only box was "corrective action required", so a technician who
// fixed a defect on the spot ticked it to record what was done. Those records
// read as "needs a repair" and offer a fault report nobody needs. This turns
// one such record into what it says: correctiveActionRequired off, the action
// text kept (lib/maintenance/pm-defect.ts). One work order at a time, by number.
//
//   npx tsx --env-file=.env.local src/lib/db/mark-pm-defect-fixed.ts WO-2026-0031           (report only)
//   npx tsx --env-file=.env.local src/lib/db/mark-pm-defect-fixed.ts WO-2026-0031 --apply   (change it)
import { db } from "@/lib/db";
import { auditLog, pmChecklists, workOrders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }
  const number = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const apply = process.argv.includes("--apply");
  if (!number) {
    console.error("Give the work order number, e.g. WO-2026-0031.");
    process.exit(1);
  }
  const [row] = await db
    .select({
      checklistId: pmChecklists.id,
      woId: workOrders.id,
      car: pmChecklists.correctiveActionRequired,
      action: pmChecklists.actionDescription,
      observations: pmChecklists.observations,
    })
    .from(workOrders)
    .innerJoin(pmChecklists, eq(pmChecklists.workOrderId, workOrders.id))
    .where(eq(workOrders.workOrderNumber, number));
  if (!row) {
    console.error(`${number} has no PM checklist.`);
    process.exit(1);
  }
  console.log(`  ${number}: found "${row.observations ?? ""}"`);
  console.log(`  action: "${row.action ?? ""}"`);
  if (!row.car) {
    console.log("  Already reads as no defect or fixed during the PM. Nothing to do.");
    process.exit(0);
  }
  if (!row.action?.trim()) {
    console.error("  No action is recorded, so there is nothing to show it was fixed. Not changing it.");
    process.exit(1);
  }
  if (!apply) {
    console.log("  Would mark it fixed during the PM. Run again with --apply to change it.");
    process.exit(0);
  }
  await db.update(pmChecklists).set({ correctiveActionRequired: false }).where(eq(pmChecklists.id, row.checklistId));
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: null,
    userName: "System",
    action: "UPDATE",
    entityType: "pm_checklist",
    entityId: row.checklistId,
    entityDescription: `PM checklist for ${number}: defect re-read as fixed during the PM (action recorded: ${row.action.trim()})`,
  });
  console.log("  Marked fixed during the PM.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
