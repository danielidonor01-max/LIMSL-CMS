// src/lib/attention.ts
// Which modules have something waiting on this person, for the green dot in
// the sidebar (LIMSL, 16 Nov 2026).
//
// The dot is not "you have a notification". A notification is read and gone;
// the dot stays until the work is done. HSE asked to raise a JHA sees the dot
// on JHA until the JHA exists, however many times the bell is opened. So it
// is computed from the state of the work, never from the inbox.

// Where each kind of signature is given.
export const SIGNOFF_MODULE: Record<string, string> = {
  WMS: "/wms",
  JHA: "/jha",
  PERMIT: "/permits",
  PERMIT_CLOSEOUT: "/permits",
  WORK_ORDER: "/work-orders",
  PM_CHECKLIST: "/work-orders",
  PM_BATCH: "/pm-batches",
  PROCEDURE: "/procedure",
  CORRECTIVE: "/corrective",
  NON_CONFORMITY: "/audit/non-conformity",
  SAFETY_INCIDENT: "/incidents",
  ASSET_CATEGORY: "/asset-categories",
  WORK_DATE: "/pm-batches",
};

export type AttentionFacts = {
  /** Entity types of every sign-off step this person can sign right now. */
  signoffs: string[];
  /** Open batches whose method statement has not been written. */
  batchesNeedingWms: number;
  /** Open batches whose method is approved and whose analysis is missing or stale. */
  batchesNeedingJha: number;
  /** Open, approved batches with an approved analysis and no live permit. */
  batchesNeedingPermit: number;
  /** Open work assigned to this person. */
  myOpenWork: number;
  canWriteWms: boolean;
  canWriteJha: boolean;
  canIssuePermit: boolean;
};

export function attentionModules(f: AttentionFacts): string[] {
  const out = new Set<string>();
  for (const t of f.signoffs) {
    const href = SIGNOFF_MODULE[t];
    if (href) out.add(href);
  }
  if (f.signoffs.length) out.add("/approvals");
  if (f.canWriteWms && f.batchesNeedingWms > 0) out.add("/wms");
  if (f.canWriteJha && f.batchesNeedingJha > 0) out.add("/jha");
  if (f.canIssuePermit && f.batchesNeedingPermit > 0) out.add("/permits");
  if (f.myOpenWork > 0) out.add("/my-tasks");
  return [...out].sort();
}
