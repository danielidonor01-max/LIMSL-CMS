// src/lib/db/clear-preassigned.ts
// Removing the names the legacy workbook put against a year of plan rows.
//
// LIMSL decided (9 Nov 2026) that nobody is assigned to a PM ahead of time:
// staff change, and a name written against a date months away is a guess that
// later reads like a commitment. A plan row is assigned when its day comes
// round, and assigning it raises the batch. The workbook's "responsible"
// column had been imported onto 306 rows, so every one of them looked taken.
//
// Only rows with no PM batch are touched: a row in a batch was assigned through
// the real path and its name is the batch's. Completed rows keep theirs, since
// that is a record of who did the work.
//
//   DATABASE_URL=... npx tsx src/lib/db/clear-preassigned.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/clear-preassigned.ts
import { db } from "@/lib/db";
import { maintenanceSchedule, auditLog } from "@/lib/db/schema";
import { and, isNull, isNotNull, ne, or, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }

  const rows = await db
    .select({
      id: maintenanceSchedule.id,
      name: maintenanceSchedule.responsiblePersonName,
    })
    .from(maintenanceSchedule)
    .where(
      and(
        isNull(maintenanceSchedule.batchId),
        ne(maintenanceSchedule.status, "COMPLETED"),
        or(
          isNotNull(maintenanceSchedule.responsiblePersonName),
          isNotNull(maintenanceSchedule.responsiblePersonId),
          and(isNotNull(maintenanceSchedule.assistantIds), ne(maintenanceSchedule.assistantIds, "[]")),
        ),
      ),
    );

  const byName = new Map<string, number>();
  for (const r of rows) byName.set(r.name ?? "(id only)", (byName.get(r.name ?? "(id only)") ?? 0) + 1);
  console.log(`\nPlan rows to clear: ${rows.length}`);
  for (const [name, n] of byName) console.log(`  ${n.toString().padStart(4)}  ${name}`);
  if (dryRun || rows.length === 0) {
    console.log(dryRun ? "\n--dry-run: nothing changed." : "\nNothing to do.");
    process.exit(0);
  }

  const ids = rows.map((r) => r.id);
  await db.transaction(async () => {
    for (let i = 0; i < ids.length; i += 500) {
      await db
        .update(maintenanceSchedule)
        .set({ responsiblePersonName: null, responsiblePersonId: null, assistantIds: null })
        .where(inArray(maintenanceSchedule.id, ids.slice(i, i + 500)));
    }
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: null,
      userName: "System (clean slate)",
      action: "UPDATE",
      entityType: "maintenance_schedule",
      entityId: "bulk",
      entityDescription: `Cleared pre-assigned people from ${rows.length} open plan rows (imported from the legacy workbook). PM is assigned when due, which raises its batch.`,
    });
  });
  console.log(`\nCleared ${rows.length} rows.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
