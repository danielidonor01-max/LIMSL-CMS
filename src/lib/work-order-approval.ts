// src/lib/work-order-approval.ts
// A work order at LIMSL is management authorising commencement. That was only
// ever implied by the work order existing, so "approved" and "typed into the
// system" were the same event and the authorisation meant nothing.
//
// Now the work order is raised as PENDING_APPROVAL and carries the standard
// two-step chain. The permit keys off this: no permit and no spanner until the
// work order is approved.
//
// The method statement and hazard analysis deliberately do NOT. They used to,
// and it deadlocked every new job: the safety documents could not be prepared
// until the work was authorised, and nobody could sensibly authorise work
// without seeing how it would be done. Preparing paperwork for a job that is
// still being decided is normal and safe; starting the job is what needs
// authorising, and the permit is what allows that.
import { db } from "@/lib/db";
import { workOrders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSignoffChain } from "@/lib/signoff/service";
import { chainSummary } from "@/lib/signoff/chains";

export const WO_APPROVAL_ENTITY = "WORK_ORDER";

// Flip any work order whose approval chain has completed. Called from the read
// paths, the same way schedule and permit reconciliation already work, so the
// status is never stale by the time anyone looks at it.
export async function reconcileWorkOrderApprovals() {
  // Two populations need stamping. Work orders waiting on approval, which move
  // to OPEN when signed; and emergencies that already commenced, which are
  // already OPEN and are only waiting for the signatures to catch up.
  const waiting = await db
    .select()
    .from(workOrders)
    .where(eq(workOrders.status, "PENDING_APPROVAL"));
  const retrospective = (
    await db.select().from(workOrders).where(eq(workOrders.approvalRetrospective, true))
  ).filter((wo) => !wo.approvedAt && wo.status !== "CANCELLED");

  for (const wo of [...waiting, ...retrospective]) {
    const chain = await getSignoffChain(WO_APPROVAL_ENTITY, wo.id);
    if (!chain.length || !chainSummary(chain).complete) continue;

    // The approver of record is whoever signed last, not step one. Step one is
    // the foreman raising it, which is the request, not the authorisation.
    const approver = [...chain]
      .filter((s) => s.status === "SIGNED")
      .sort((a, b) => b.stepOrder - a.stepOrder)[0];

    await db
      .update(workOrders)
      .set({
        // An emergency is already running; approving it must not reset it to
        // OPEN and wipe out the fact that work is under way.
        status: wo.status === "PENDING_APPROVAL" ? "OPEN" : wo.status,
        approvedById: approver?.signedById ?? null,
        approvedByName: approver?.signedByName ?? null,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(workOrders.id, wo.id));
  }
}

// Work orders created before the gate existed are already OPEN and stay OPEN.
// Retro-fitting an approval requirement onto live jobs would strand work in the
// field with no way to record what was already authorised on paper.
export function requiresApproval(status: string): boolean {
  return status === "PENDING_APPROVAL";
}

export function approvalBlockMessage(workOrderNumber: string): string {
  return (
    `${workOrderNumber} has not been approved to commence. ` +
    `Management approval on the work order is what authorises the job, and no ` +
    `permit can be issued against it until that approval is signed. The method ` +
    `statement and hazard analysis can be prepared in the meantime.`
  );
}
