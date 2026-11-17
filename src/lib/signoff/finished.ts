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
import { db } from "@/lib/db";
import { permits } from "@/lib/db/schema";
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

/** Drop the rows of finished permit chains from a set of sign-off rows. */
export async function dropFinishedChains<T extends { entityType: string; entityId: string }>(rows: T[]): Promise<T[]> {
  const ids = [...new Set(rows.filter((r) => r.entityType === "PERMIT" || r.entityType === "PERMIT_CLOSEOUT").map((r) => r.entityId))];
  if (ids.length === 0) return rows;
  const found = await db.select({ id: permits.id, status: permits.status }).from(permits).where(inArray(permits.id, ids));
  const status = new Map(found.map((p) => [p.id, p.status]));
  return rows.filter((r) => !isFinishedChain(r.entityType, status.get(r.entityId)));
}
