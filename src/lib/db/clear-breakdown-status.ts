// src/lib/db/clear-breakdown-status.ts
// Returning to OPERATIONAL every machine marked down with nothing behind it.
//
// clean-slate.ts erased the breakdown reports but deliberately left machine
// status alone, since a status is a claim about the machine. LIMSL confirmed
// (9 Nov 2026) that none of those breakdowns had a complete path — no report
// carried through, no repair record — so the statuses describe nothing and are
// cleared. A machine that genuinely fails during the test is reported through
// the corrective flow, which is what sets the status from now on.
//
// Only machines with no open corrective record are touched. Each gets a line
// in its own history, and the audit log gets one for the whole change.
//
//   DATABASE_URL=... npx tsx src/lib/db/clear-breakdown-status.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/clear-breakdown-status.ts
import { db } from "@/lib/db";
import { equipment, equipmentLog, correctiveMaintenance, auditLog } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

const DOWN = ["BROKEN_DOWN", "UNDER_MAINTENANCE", "AWAITING_PARTS"];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }

  const reported = new Set(
    (await db.select({ equipmentId: correctiveMaintenance.equipmentId }).from(correctiveMaintenance)).map((r) => r.equipmentId),
  );
  const down = (await db.select().from(equipment).where(inArray(equipment.status, DOWN))).filter((m) => !reported.has(m.id));

  console.log(`\nBack to OPERATIONAL (${down.length}):`);
  for (const m of down) console.log(`  ${m.assetId}  ${m.name}  (was ${m.status})`);
  if (dryRun || down.length === 0) {
    console.log(dryRun ? "\n--dry-run: nothing changed." : "\nNothing to do.");
    process.exit(0);
  }

  const now = new Date().toISOString();
  await db.transaction(async () => {
    await db.update(equipment).set({ status: "OPERATIONAL" }).where(inArray(equipment.id, down.map((m) => m.id)));
    await db.insert(equipmentLog).values(
      down.map((m) => ({
        id: nanoid(),
        equipmentId: m.id,
        category: "STATUS",
        title: `Status changed: ${m.status.replace(/_/g, " ")} to OPERATIONAL`,
        detail: "Cleared in the clean slate before live testing: no breakdown report or repair record stood behind the status.",
        source: "AUTO",
        performedByName: "System (clean slate)",
        occurredAt: now,
      })),
    );
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: null,
      userName: "System (clean slate)",
      action: "UPDATE",
      entityType: "equipment",
      entityId: "clear-breakdown-status",
      entityDescription:
        `${down.length} machine${down.length === 1 ? "" : "s"} returned to OPERATIONAL on LIMSL's instruction, ` +
        `none having a complete breakdown report or repair record behind the status: ` +
        down.map((m) => `${m.assetId} (was ${m.status})`).join(", "),
    });
  });
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
