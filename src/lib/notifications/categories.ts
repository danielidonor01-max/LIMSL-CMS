// src/lib/notifications/categories.ts
// Sorting one stream of notifications into things that matter differently.
//
// Everything arrived in one list at one visual weight: a machine breakdown, a
// permit about to expire, a calibration reminder and a procedure revision, all
// the same size, all the same colour, newest first. An inbox where a fire alarm
// and a memo look identical trains people to skim past both.
//
// Classified from the event and the entity it relates to, both of which are
// already stored. Nothing here reads the title text: a category derived from
// wording changes silently the day somebody rewrites a message.

export type NotifCategory = "SAFETY" | "MAINTENANCE" | "COMPLIANCE" | "GENERAL";
export type NotifPriority = "URGENT" | "NORMAL" | "LOW";

export const CATEGORY_LABEL: Record<NotifCategory, string> = {
  SAFETY: "Safety",
  MAINTENANCE: "Maintenance",
  COMPLIANCE: "Compliance",
  GENERAL: "General",
};

// Safety is the only one that gets a colour. If every category is tinted the
// tinting stops meaning anything, which is the problem this module exists to
// fix rather than one to reproduce with four colours instead of one.
export const CATEGORY_TONE: Record<NotifCategory, string> = {
  SAFETY: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  MAINTENANCE: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  COMPLIANCE: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  GENERAL: "bg-ink-500/10 text-ink-600 border-ink-500/20",
};

type Signal = {
  event?: string | null;
  relatedEntityType?: string | null;
};

// The entity a message is about is a stronger signal than the event, because
// GENERAL is the catch-all every new feature reaches for. A permit expiring and
// an incident being reported both arrive as GENERAL, and neither is general.
const BY_ENTITY: Record<string, { category: NotifCategory; priority: NotifPriority }> = {
  permit: { category: "SAFETY", priority: "URGENT" },
  safety_incident: { category: "SAFETY", priority: "URGENT" },
  jha: { category: "SAFETY", priority: "NORMAL" },
  wms: { category: "SAFETY", priority: "NORMAL" },
  non_conformity: { category: "COMPLIANCE", priority: "NORMAL" },
  calibration: { category: "COMPLIANCE", priority: "NORMAL" },
  corrective_maintenance: { category: "MAINTENANCE", priority: "URGENT" },
  work_order: { category: "MAINTENANCE", priority: "NORMAL" },
  equipment: { category: "MAINTENANCE", priority: "NORMAL" },
  procedure: { category: "COMPLIANCE", priority: "LOW" },
};

const BY_EVENT: Record<string, { category: NotifCategory; priority: NotifPriority }> = {
  BREAKDOWN: { category: "MAINTENANCE", priority: "URGENT" },
  PTW_SIGN_REQUEST: { category: "SAFETY", priority: "URGENT" },
  WMS_SIGN_REQUEST: { category: "SAFETY", priority: "NORMAL" },
  CORRECTIVE_SIGN_REQUEST: { category: "MAINTENANCE", priority: "NORMAL" },
  PM_SIGN_REQUEST: { category: "COMPLIANCE", priority: "NORMAL" },
  PROCEDURE_SIGN_REQUEST: { category: "COMPLIANCE", priority: "LOW" },
};

export function classify(n: Signal): { category: NotifCategory; priority: NotifPriority } {
  const byEntity = n.relatedEntityType ? BY_ENTITY[n.relatedEntityType] : undefined;
  const byEvent = n.event ? BY_EVENT[n.event] : undefined;

  // Entity wins where both are known, because the event is coarse and its
  // catch-all value carries the most important messages in the system.
  if (byEntity) return byEntity;
  if (byEvent) return byEvent;
  return { category: "GENERAL", priority: "LOW" };
}

export const CATEGORY_FILTERS: (NotifCategory | "ALL")[] = [
  "ALL",
  "SAFETY",
  "MAINTENANCE",
  "COMPLIANCE",
  "GENERAL",
];

/**
 * Urgent first, then newest first.
 *
 * Strictly by date is what buried a permit expiry under three procedure
 * revisions, and the permit is the one with a crew waiting on it.
 */
export function sortNotifications<T extends Signal & { createdAt?: string | null; readAt?: string | null }>(
  rows: T[],
): T[] {
  const rank: Record<NotifPriority, number> = { URGENT: 0, NORMAL: 1, LOW: 2 };
  return [...rows].sort((a, b) => {
    // An unread urgent message outranks a read one whatever the dates say;
    // beyond that, reading something must not reorder the list under the
    // reader's cursor.
    const ua = a.readAt ? 1 : 0;
    const ub = b.readAt ? 1 : 0;
    if (ua !== ub) return ua - ub;

    const pa = rank[classify(a).priority];
    const pb = rank[classify(b).priority];
    if (pa !== pb) return pa - pb;

    return String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""));
  });
}
