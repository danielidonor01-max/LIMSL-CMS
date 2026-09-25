// src/lib/maintenance/work-readiness-db.ts
// Reading a job's documents for the readiness check. Server only; the rule
// itself is pure and lives in work-readiness.ts.
//
// Which documents belong to a job depends on what kind of job it is:
//   • A PM work order is one machine inside a batch. Its method statement and
//     hazard analysis are the CATEGORY's standing pair, and its permit is the
//     batch's, raised for this cycle.
//   • A repair is one machine. Its documents are its own.
// The permit always wins when there is one: it names the exact WMS and JHA it
// was issued against, which is what the work is actually authorised under.
import { db } from "@/lib/db";
import { workOrders, permits, wmsDocuments, jhaDocuments, pmBatches } from "@/lib/db/schema";
import { and, desc, eq, notInArray, or } from "drizzle-orm";
import { readinessToWork, type Readiness } from "./work-readiness";
import { standingPairFor } from "@/lib/hse/standing-documents";

export type JobReadiness = Readiness & {
  workOrderId: string;
  permitId: string | null;
  permitNumber: string | null;
  today: string;
};

// The same "today" the permit renewal route uses, so a day revalidated on the
// permit is the day the job checks for.
export const permitToday = () => new Date().toISOString().slice(0, 10);

export async function loadReadiness(workOrderId: string): Promise<JobReadiness | null> {
  const [wo] = await db.select().from(workOrders).where(eq(workOrders.id, workOrderId)).limit(1);
  if (!wo) return null;

  const [permit] = await db
    .select()
    .from(permits)
    .where(
      and(
        wo.batchId ? or(eq(permits.workOrderId, wo.id), eq(permits.batchId, wo.batchId)) : eq(permits.workOrderId, wo.id),
        notInArray(permits.status, ["REJECTED", "CANCELLED"]),
      ),
    )
    .orderBy(desc(permits.createdAt))
    .limit(1);

  let wms: typeof wmsDocuments.$inferSelect | null = null;
  let jha: typeof jhaDocuments.$inferSelect | null = null;

  if (permit?.wmsId || permit?.jhaId) {
    if (permit.wmsId) [wms] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, permit.wmsId)).limit(1);
    if (permit.jhaId) [jha] = await db.select().from(jhaDocuments).where(eq(jhaDocuments.id, permit.jhaId)).limit(1);
  } else if (wo.batchId) {
    const [batch] = await db.select().from(pmBatches).where(eq(pmBatches.id, wo.batchId)).limit(1);
    if (batch) {
      const pair = await standingPairFor(batch.category);
      wms = pair.wms;
      jha = pair.jha;
    }
  } else {
    [wms] = await db
      .select()
      .from(wmsDocuments)
      .where(eq(wmsDocuments.workOrderId, wo.id))
      .orderBy(desc(wmsDocuments.revision))
      .limit(1);
    if (wms) {
      [jha] = await db
        .select()
        .from(jhaDocuments)
        .where(eq(jhaDocuments.wmsId, wms.id))
        .orderBy(desc(jhaDocuments.revision))
        .limit(1);
    }
  }

  const today = permitToday();
  const r = readinessToWork({
    today,
    workOrder: wo,
    wms: wms ?? null,
    jha: jha ?? null,
    permit: permit ?? null,
  });
  return {
    ...r,
    workOrderId: wo.id,
    permitId: permit?.id ?? null,
    permitNumber: permit?.permitNumber ?? null,
    today,
  };
}

/**
 * Whether a permit was ever in force for this job — issued and fully signed,
 * whatever it is now (still active, expired, or closed after the work).
 *
 * Closing a job, or recording the PM done on it, asks this rather than "is it
 * valid today": the work may have finished yesterday. What it may not have
 * done is happen with no permit at all.
 */
export async function permitWasIssued(workOrderId: string): Promise<boolean> {
  const [wo] = await db
    .select({ id: workOrders.id, batchId: workOrders.batchId })
    .from(workOrders)
    .where(eq(workOrders.id, workOrderId))
    .limit(1);
  if (!wo) return false;
  const rows = await db
    .select({ status: permits.status })
    .from(permits)
    .where(wo.batchId ? or(eq(permits.workOrderId, wo.id), eq(permits.batchId, wo.batchId)) : eq(permits.workOrderId, wo.id));
  return rows.some((r) => !["DRAFT", "PENDING_APPROVAL", "REJECTED", "CANCELLED"].includes(r.status));
}
