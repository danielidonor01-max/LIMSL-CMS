// src/lib/maintenance/work-order-status.ts
// The moves a person may make to a work order's status through the update
// route. Everything else happens elsewhere, on purpose:
//
//   PENDING_APPROVAL → OPEN   only the approval chain (reconcileWorkOrderApprovals)
//   REJECTED → PENDING_APPROVAL   only "Revise & resubmit"
//   OPEN → IN_PROGRESS        also clocking on (the time route)
//   PREVENTIVE → COMPLETED    only filing the PM checklist
//
// The route used to write whatever status it was sent. A technician could move
// a work order from awaiting approval to open, which the permit and start-work
// checks then read as approved; complete a repair nobody had authorised; or
// reopen a cancelled job.

export const WORK_ORDER_STATUSES = ["PENDING_APPROVAL", "REJECTED", "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

const ALLOWED: Record<string, string[]> = {
  PENDING_APPROVAL: ["CANCELLED"],
  REJECTED: ["CANCELLED"],
  OPEN: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Why this move is refused, or null when it is allowed. Staying put is always allowed. */
export function workOrderMoveError(from: string, to: string, workOrderNumber = "This work order"): string | null {
  if (from === to) return null;
  if (!(WORK_ORDER_STATUSES as readonly string[]).includes(to)) return `"${to}" is not a work order status.`;
  if ((ALLOWED[from] ?? []).includes(to)) return null;

  if (from === "PENDING_APPROVAL") {
    return `${workOrderNumber} is waiting for approval. It opens when its approval is signed, not by changing its status.`;
  }
  if (from === "REJECTED") {
    return `${workOrderNumber} was rejected. Revise and resubmit it for approval, or cancel it.`;
  }
  if (from === "COMPLETED" || from === "CANCELLED") {
    return `${workOrderNumber} is ${from.toLowerCase()} and cannot be reopened. Raise a new work order.`;
  }
  return `${workOrderNumber} cannot move from ${from.replace("_", " ").toLowerCase()} to ${to.replace("_", " ").toLowerCase()}.`;
}
