// src/lib/signoff/trail.ts
// Telling the trail. When a document finishes a pass or is fully signed, the
// people who already signed it and the technicians whose work it clears hear
// about it without having to check. The technician waiting on a WMS, a JHA and
// a permit before a batch can start is the person this exists for: the work
// cannot begin until all three land, and nothing else tells them when.
import { db } from "@/lib/db";
import { pmBatches, wmsDocuments, jhaDocuments, permits, signoffs } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { notify } from "@/lib/notifications";
import { entityHref, entityLabel } from "@/lib/signoff/inbox";
import { milestoneDetail, milestoneHeadline, type Milestone } from "@/lib/signoff/milestones";

const OPEN_BATCH = ["PLANNED", "ASSIGNED", "IN_PROGRESS"];

const ids = (json: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
};

// The open batches a document serves: named on the document, pointing at it,
// or, for a standing WMS or JHA written per category, every open batch of
// that category.
async function batchesFor(entityType: string, entityId: string) {
  let batchId: string | null = null;
  let category: string | null = null;
  if (entityType === "PM_BATCH") batchId = entityId;
  if (entityType === "WMS") {
    const [w] = await db.select({ b: wmsDocuments.batchId, c: wmsDocuments.category }).from(wmsDocuments).where(eq(wmsDocuments.id, entityId));
    batchId = w?.b ?? null;
    category = w?.c ?? null;
  }
  if (entityType === "JHA") {
    const [j] = await db.select({ b: jhaDocuments.batchId, c: jhaDocuments.category }).from(jhaDocuments).where(eq(jhaDocuments.id, entityId));
    batchId = j?.b ?? null;
    category = j?.c ?? null;
  }
  if (entityType === "PERMIT") {
    const [p] = await db.select({ b: permits.batchId }).from(permits).where(eq(permits.id, entityId));
    batchId = p?.b ?? null;
  }

  const conds = [eq(pmBatches.wmsId, entityId), eq(pmBatches.jhaId, entityId), eq(pmBatches.permitId, entityId)];
  if (batchId) conds.push(eq(pmBatches.id, batchId));
  if (category && !batchId) conds.push(eq(pmBatches.category, category));
  const rows = await db.select().from(pmBatches).where(or(...conds));
  return rows.filter((b) => b.id === batchId || OPEN_BATCH.includes(b.status));
}

async function permitHolder(entityType: string, entityId: string) {
  if (entityType !== "PERMIT") return [];
  const [p] = await db.select({ h: permits.permitHolderId }).from(permits).where(eq(permits.id, entityId));
  return p?.h ? [p.h] : [];
}

// What a finished document means for the people waiting on it.
const CLEARED: Record<string, string> = {
  WMS: "The method statement is approved for implementation. HSE can now raise the JHA.",
  JHA: "The hazard analysis is approved. The permit to work can now be raised.",
  PERMIT: "The permit is fully signed. The PM can proceed once today's checks are done.",
  PM_BATCH: "The batch work order is approved. Work can start once the permit is live.",
};

export async function notifyTrail(
  entityType: string,
  entityId: string,
  chain: { status: string; signedById?: string | null }[],
  milestone: Milestone,
  actorId: string | null | undefined,
) {
  if (milestone.kind === "SIGNED") return;

  const batches = await batchesFor(entityType, entityId);
  const people = new Set<string>([
    ...chain.filter((s) => s.status === "SIGNED" && s.signedById).map((s) => s.signedById!),
    ...batches.flatMap((b) => [b.assignedToId, ...ids(b.assistantIds)].filter((x): x is string => !!x)),
    ...(await permitHolder(entityType, entityId)),
  ]);
  // The signer saw it happen; their own toast already said so.
  if (actorId) people.delete(actorId);
  if (people.size === 0) return;

  let code = "";
  try {
    const { describeEntities } = await import("@/lib/signoff/describe");
    code = (await describeEntities([{ entityType, entityId }])).get(`${entityType}:${entityId}`)?.code ?? "";
  } catch {
    // Named without its number, still useful.
  }
  const label = `${entityLabel(entityType)}${code ? ` ${code}` : ""}`;
  const forBatch = batches.length === 1 ? ` (batch ${batches[0].batchNumber})` : "";
  const body =
    milestone.kind === "CHAIN_COMPLETE"
      ? `${CLEARED[entityType] ?? milestoneDetail(milestone)}${forBatch}`
      : `${milestoneDetail(milestone)}${forBatch}`;

  await notify({
    event: "MILESTONE",
    title: milestoneHeadline(milestone, label),
    body,
    linkPath: entityHref(entityType, entityId),
    relatedEntityType: entityType,
    relatedEntityId: entityId,
    userIds: [...people],
  });
}

// A batch is finished when every machine's work order is. Said once, to
// everyone who carried it: the people who approved and assigned it and the
// crew who did it.
export async function notifyBatchComplete(batchId: string, actorId: string | null | undefined) {
  const [b] = await db.select().from(pmBatches).where(eq(pmBatches.id, batchId));
  if (!b) return;
  // Whoever approved the batch work order is on its signature chain.
  const approvers = await db
    .select({ by: signoffs.signedById })
    .from(signoffs)
    .where(and(eq(signoffs.entityType, "PM_BATCH"), eq(signoffs.entityId, b.id), eq(signoffs.status, "SIGNED")));
  const people = new Set<string>(
    [b.assignedToId, b.assignedById, b.createdBy, ...ids(b.assistantIds), ...approvers.map((a) => a.by)].filter(
      (x): x is string => !!x,
    ),
  );
  if (actorId) people.delete(actorId);
  if (people.size === 0) return;
  await notify({
    event: "MILESTONE",
    title: `PM batch ${b.batchNumber} completed`,
    body: `Every machine in ${b.title} has its PM checklist submitted. The checklists now go for verification.`,
    linkPath: `/pm-batches/${b.id}`,
    relatedEntityType: "PM_BATCH",
    relatedEntityId: b.id,
    userIds: [...people],
  });
}

