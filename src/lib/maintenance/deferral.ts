// src/lib/maintenance/deferral.ts
// Deferring maintenance is a risk acceptance. Before this existed there was no
// legitimate way to record one, so real deferrals happened by silence: the
// activity simply went overdue and stayed there, no justification, no owner,
// and no date anyone had agreed to look at it again.
//
// Two rules make a deferral auditable rather than a hiding place:
//   1. someone states what risk they are accepting, in their own words;
//   2. it is time-boxed, and on the review date the activity returns to OVERDUE
//      (enforced by reconcileSchedule, not here).

export const MIN_DEFERRAL_REASON_CHARS = 10;
export const MAX_DEFERRAL_REASON_CHARS = 500;

export type DeferralInput = {
  reason: unknown;
  reviewDate: unknown;
  today: string;
};

export type DeferralCheck =
  | { ok: true; reason: string; reviewDate: string }
  | { ok: false; error: string };

export function validateDeferral({ reason, reviewDate, today }: DeferralInput): DeferralCheck {
  const text = String(reason ?? "").trim();
  const review = String(reviewDate ?? "").slice(0, 10);

  if (text.length < MIN_DEFERRAL_REASON_CHARS) {
    return {
      ok: false,
      error: "Give the reason and the risk accepted by deferring this activity (at least a sentence).",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review) || review <= today) {
    return {
      ok: false,
      error: "Set a review date in the future, a deferral without one is just an overdue activity.",
    };
  }
  return { ok: true, reason: text.slice(0, MAX_DEFERRAL_REASON_CHARS), reviewDate: review };
}
