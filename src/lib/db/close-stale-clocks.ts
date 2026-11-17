// src/lib/db/close-stale-clocks.ts
// Clocks left running on finished jobs (LIMSL, 16 Nov 2026).
//
// Before finishing a job clocked everybody off it, a PM could be completed
// with its technician still clocked on. The work order then said "clocked on
// now" for good, and no one could clock off a closed job. This ends each such
// stretch at the moment the job was finished: the checklist's signing time
// for a PM, otherwise the work order's last update.
//
//   npx tsx --env-file=.env.local src/lib/db/close-stale-clocks.ts           (report only)
//   npx tsx --env-file=.env.local src/lib/db/close-stale-clocks.ts --apply   (close them)
import { db } from "@/lib/db";
import { pmChecklists, workOrderTimeLogs, workOrders } from "@/lib/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");

  const stale = await db
    .select({
      logId: workOrderTimeLogs.id,
      userName: workOrderTimeLogs.userName,
      startedAt: workOrderTimeLogs.startedAt,
      woId: workOrders.id,
      woNumber: workOrders.workOrderNumber,
      status: workOrders.status,
      updatedAt: workOrders.updatedAt,
      signedAt: pmChecklists.signedAt,
    })
    .from(workOrderTimeLogs)
    .innerJoin(workOrders, eq(workOrders.id, workOrderTimeLogs.workOrderId))
    .leftJoin(pmChecklists, eq(pmChecklists.workOrderId, workOrders.id))
    .where(and(isNull(workOrderTimeLogs.endedAt), inArray(workOrders.status, ["COMPLETED", "CANCELLED"])));

  if (stale.length === 0) {
    console.log("No clocks are running on finished jobs.");
    process.exit(0);
  }
  for (const s of stale) {
    const end = s.signedAt ?? s.updatedAt;
    console.log(`  ${s.woNumber} (${s.status})  ${s.userName ?? "?"}  started ${s.startedAt}  ->  ends ${end}`);
    if (apply) {
      await db.update(workOrderTimeLogs).set({ endedAt: end }).where(eq(workOrderTimeLogs.id, s.logId));
    }
  }
  console.log(apply ? `Closed ${stale.length}.` : `${stale.length} to close. Run again with --apply to close them.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
