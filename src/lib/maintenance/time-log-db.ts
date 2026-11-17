// src/lib/maintenance/time-log-db.ts
// Finishing a job clocks everybody off it (LIMSL, 16 Nov 2026).
//
// A PM was completed with the technician still clocked on, so the finished
// work order said "clocked on now" and "0m booked" for good: time cannot be
// booked to a closed job, so nobody could ever clock off it. Whatever closes a
// job (the checklist, completing it, cancelling it) now ends the open
// stretches at that moment, which is also the honest end of the work.
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { workOrderTimeLogs } from "@/lib/db/schema";

type Executor = Pick<typeof db, "update">;

export async function clockEveryoneOff(
  executor: Executor,
  workOrderId: string,
  at: string = new Date().toISOString(),
): Promise<number> {
  const closed = await executor
    .update(workOrderTimeLogs)
    .set({ endedAt: at })
    .where(and(eq(workOrderTimeLogs.workOrderId, workOrderId), isNull(workOrderTimeLogs.endedAt)))
    .returning({ id: workOrderTimeLogs.id });
  return closed.length;
}
