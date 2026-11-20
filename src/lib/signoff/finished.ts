// src/lib/signoff/finished.ts
// A signature on a finished permit is not waiting on anybody (LIMSL, 17 Nov
// 2026). The PTW sidebar dot stayed green because:
//   • cancelling a permit removes its unsigned steps, and opening the
//     cancelled permit afterwards rebuilt them (GET /api/signoffs ensures the
//     chain), so PTW-2026-0004 asked for an applicant again; and
//   • a closed permit's optional Affected Custodian step still counted.
// Approval steps of a permit that is no longer pending, and close-out steps of
// one that is closed or cancelled, are dropped from every "waiting on you"
// list, and such chains are never rebuilt on read.
//
// The same goes for a cancelled work order (LIMSL, 20 Nov 2026): it cannot be
// revalidated, a new one has to be raised, so its approval steps are history.
// And a breakdown record with no work order has nothing to sign off yet: its
// first signature is refused until a work order and permit exist, so it does
// not sit in anybody's inbox either.
import { db } from "@/lib/db";
import { correctiveMaintenance, permits, workOrders } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

/** Statuses after which the permit's approval chain is history. */
export const PERMIT_APPROVAL_DONE = [
  "ACTIVE",
  "CANCELLED",
  "REJECTED",
  "EXPIRED",
  "CLOSED",
  "CLOSED_LATE",
  "CLOSED_WORK_ONGOING",
];
/** Statuses after which the close-out chain is history too. */
export const PERMIT_CLOSEOUT_DONE = ["CANCELLED", "REJECTED", "CLOSED", "CLOSED_LATE", "CLOSED_WORK_ONGOING"];

/** True when this chain belongs to a permit that no longer needs it signed. */
export function isFinishedChain(entityType: string, permitStatus: string | null | undefined): boolean {
  if (!permitStatus) return false;
  if (entityType === "PERMIT") return PERMIT_APPROVAL_DONE.includes(permitStatus);
  if (entityType === "PERMIT_CLOSEOUT") return PERMIT_CLOSEOUT_DONE.includes(permitStatus);
  return false;
}

/** A work order chain is dead once the work order is cancelled. */
export const isDeadWorkOrderChain = (entityType: string, workOrderStatus: string | null | undefined) =>
  entityType === "WORK_ORDER" && workOrderStatus === "CANCELLED";

/** A breakdown record's sign-off waits on nobody while it has no work order. */
export const isWaitingForWorkOrder = (entityType: string, record: { workOrderId: string | null; status: string | null } | undefined) =>
  entityType === "CORRECTIVE" && !!record && !record.workOrderId && record.status !== "CLOSED";

const idsOf = (rows: { entityType: string; entityId: string }[], types: string[]) => [
  ...new Set(rows.filter((r) => types.includes(r.entityType)).map((r) => r.entityId)),
];

/** Drop the rows of chains nobody can or should sign from a set of sign-off rows. */
export async function dropFinishedChains<T extends { entityType: string; entityId: string }>(rows: T[]): Promise<T[]> {
  const permitIds = idsOf(rows, ["PERMIT", "PERMIT_CLOSEOUT"]);
  const woIds = idsOf(rows, ["WORK_ORDER"]);
  const cmIds = idsOf(rows, ["CORRECTIVE"]);
  if (permitIds.length + woIds.length + cmIds.length === 0) return rows;

  const [permitRows, woRows, cmRows] = await Promise.all([
    permitIds.length ? db.select({ id: permits.id, status: permits.status }).from(permits).where(inArray(permits.id, permitIds)) : [],
    woIds.length ? db.select({ id: workOrders.id, status: workOrders.status }).from(workOrders).where(inArray(workOrders.id, woIds)) : [],
    cmIds.length
      ? db
          .select({ id: correctiveMaintenance.id, workOrderId: correctiveMaintenance.workOrderId, status: correctiveMaintenance.status })
          .from(correctiveMaintenance)
          .where(inArray(correctiveMaintenance.id, cmIds))
      : [],
  ]);
  const permitStatus = new Map(permitRows.map((p: { id: string; status: string }) => [p.id, p.status]));
  const woStatus = new Map(woRows.map((w: { id: string; status: string }) => [w.id, w.status]));
  const cm = new Map(cmRows.map((c: { id: string; workOrderId: string | null; status: string | null }) => [c.id, c]));
  return rows.filter(
    (r) =>
      !isFinishedChain(r.entityType, permitStatus.get(r.entityId)) &&
      !isDeadWorkOrderChain(r.entityType, woStatus.get(r.entityId)) &&
      !isWaitingForWorkOrder(r.entityType, cm.get(r.entityId)),
  );
}
