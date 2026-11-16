// src/lib/maintenance/batch-authorisation.ts
// Pure, so the permit route, the batch page and the tests read one rule.
// Whether a batch is authorised: every line that is still in play has been
// approved, either by the batch's own approval or, on a batch raised before
// batch approval existed, one by one.
export function batchAuthorisation(lines: { workOrderNumber: string; status: string }[]):
  | { ok: true }
  | { ok: false; reason: string } {
  const live = lines.filter((l) => l.status !== "CANCELLED");
  if (live.length === 0) return { ok: false, reason: "The batch has no work order lines." };
  const waiting = live.filter((l) => l.status === "PENDING_APPROVAL");
  if (waiting.length) {
    return {
      ok: false,
      reason:
        "The batch work order has not been approved to commence. The Foreman raises it and the " +
        "Maintenance Manager approves it on the batch page; the permit can be issued once that is signed.",
    };
  }
  const rejected = live.filter((l) => l.status === "REJECTED");
  if (rejected.length) {
    return {
      ok: false,
      reason: `${rejected.map((r) => r.workOrderNumber).join(", ")} ${rejected.length === 1 ? "was" : "were"} rejected. Revise and resubmit before raising a permit.`,
    };
  }
  return { ok: true };
}
