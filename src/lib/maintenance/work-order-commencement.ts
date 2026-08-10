// src/lib/maintenance/work-order-commencement.ts
// Whether a work order may commence before management has signed for it.
//
// The rule at LIMSL is that the work order IS the authorisation, so a job waits
// for two signatures. An emergency cannot: a machine down at 02:00, a guard
// failure, a leak, is not going to stand still while a manager is woken to sign
// a form, and a system that demands it will simply be worked around, which is
// worse than not having the control at all.
//
// So emergencies commence immediately and the authorisation is collected AFTER
// the fact. That is a real exception, not a loophole, and it is recorded as one:
// the work order carries a retrospective-approval flag for the rest of its life,
// management is told the moment the job starts, and the same two signatures are
// still required. An emergency that is never signed off stays visible as an
// emergency that was never signed off.

export type CommencementDecision = {
  status: "OPEN" | "PENDING_APPROVAL";
  retrospective: boolean;
  reason: string;
};

// The only type that commences unapproved. CORRECTIVE is deliberately not here:
// a fault that can wait for a work order to be raised can wait for it to be
// approved, and treating every breakdown as an emergency would empty the rule.
const COMMENCE_IMMEDIATELY = new Set(["EMERGENCY"]);

export function commencementFor(type: string | null | undefined): CommencementDecision {
  if (COMMENCE_IMMEDIATELY.has(String(type ?? ""))) {
    return {
      status: "OPEN",
      retrospective: true,
      reason: "Emergency work commences immediately. Management approval is collected afterwards.",
    };
  }
  return {
    status: "PENDING_APPROVAL",
    retrospective: false,
    reason: "Work commences once management has approved the work order.",
  };
}

// A job that started on the emergency exception and still has no signatures.
// This is the thing an auditor asks about, so it has to be answerable by a
// query rather than by memory.
export function isAwaitingRetrospectiveApproval(wo: {
  approvalRetrospective?: boolean | null;
  approvedAt?: string | null;
  status?: string | null;
}): boolean {
  if (!wo.approvalRetrospective) return false;
  if (wo.approvedAt) return false;
  return wo.status !== "CANCELLED";
}

// How overdue the paperwork is. Emergency work is authorised after the fact, but
// "after the fact" cannot mean "never", and a week-old unsigned emergency is a
// different conversation from one signed the same morning.
export function retrospectiveApprovalAgeDays(
  createdAt: string | null | undefined,
  now: string,
): number {
  if (!createdAt) return 0;
  const from = Date.parse(`${String(createdAt).slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${now.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  const days = Math.round((to - from) / 86_400_000);
  return days > 0 ? days : 0;
}
