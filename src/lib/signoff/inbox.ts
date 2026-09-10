// src/lib/signoff/inbox.ts
// Everything waiting on one person's signature, in one place.
//
// The sign-off engine already knows all of it. What it could not do was answer
// "what is waiting on ME", because every chain was only ever read one record at
// a time, from that record's own page. So a supervisor's morning was: open work
// orders and filter, open corrective and filter, open WMS, open JHA, open
// permits, and hope nothing was missed in a module they did not think to check.
//
// A step is actionable when three things are true at once, and all three matter:
//   1. the person may sign that step's role,
//   2. the step is unlocked, meaning every earlier required step is signed,
//   3. the step is not reserved for a different named person.
//
// Dropping (2) is the tempting simplification and it is wrong: it fills the
// inbox with steps that cannot be signed yet, which is exactly the noise that
// makes people stop reading an inbox.
import { canSignStep } from "@/lib/roles";
import { isStepUnlocked } from "@/lib/signoff/chains";

export type SignoffRow = {
  id: string;
  entityType: string;
  entityId: string;
  stepOrder: number;
  role: string;
  roleLabel: string;
  required: boolean | null;
  status: string;
  signerUserId?: string | null;
  signerUserName?: string | null;
};

export type Actor = { id?: string | null; role?: string | null };

// Where a given entity type is read, and what to call it. Keeping this beside
// the inbox rather than in the page means a new chain that forgets to register
// here shows up as an obviously-unlabelled row rather than a broken link.
export const ENTITY_META: Record<string, { label: string; href: (id: string) => string }> = {
  WORK_ORDER: { label: "Work order", href: (id) => `/work-orders/${id}` },
  PM_CHECKLIST: { label: "PM checklist", href: (id) => `/work-orders/${id}` },
  CORRECTIVE: { label: "Corrective record", href: (id) => `/corrective/${id}` },
  WMS: { label: "Method statement", href: (id) => `/wms/${id}` },
  JHA: { label: "Hazard analysis", href: (id) => `/jha/${id}` },
  PERMIT: { label: "Permit to work", href: (id) => `/permits/${id}` },
  PERMIT_CLOSEOUT: { label: "Permit close-out", href: (id) => `/permits/${id}` },
  PROCEDURE: { label: "Maintenance procedure", href: (id) => `/procedure/${id}` },
  NON_CONFORMITY: { label: "Non-conformity", href: () => `/audit/non-conformity` },
  SAFETY_INCIDENT: { label: "Safety incident", href: (id) => `/incidents/${id}` },
};

export const entityLabel = (t: string) => ENTITY_META[t]?.label ?? t.toLowerCase().replace(/_/g, " ");
export const entityHref = (t: string, id: string) => ENTITY_META[t]?.href(id) ?? "/";

export type InboxItem = {
  signoffId: string;
  entityType: string;
  entityId: string;
  stepOrder: number;
  role: string;
  roleLabel: string;
  /** True when this step names this person specifically rather than their role. */
  personal: boolean;
};

/**
 * The steps `actor` can sign right now, from every chain in the system.
 *
 * `rows` is every signoff row for the entities under consideration; they are
 * grouped by entity here so the unlock rule sees a whole chain rather than one
 * step out of context.
 */
export function pendingFor(rows: SignoffRow[], actor: Actor): InboxItem[] {
  const byEntity = new Map<string, SignoffRow[]>();
  for (const r of rows) {
    const key = `${r.entityType}:${r.entityId}`;
    byEntity.set(key, [...(byEntity.get(key) ?? []), r]);
  }

  const out: InboxItem[] = [];

  for (const chain of byEntity.values()) {
    const ordered = [...chain].sort((a, b) => a.stepOrder - b.stepOrder);

    for (const step of ordered) {
      if (step.status !== "PENDING") continue;

      // A step reserved for a named person is theirs alone. The permit holder
      // signs the permit issued to him and no other technician signs it for
      // him, so role seniority does not open it either.
      if (step.signerUserId) {
        if (step.signerUserId !== actor.id) continue;
      } else if (!canSignStep(actor.role, step.role)) {
        continue;
      }

      if (!isStepUnlocked(ordered, step.stepOrder)) continue;

      out.push({
        signoffId: step.id,
        entityType: step.entityType,
        entityId: step.entityId,
        stepOrder: step.stepOrder,
        role: step.role,
        roleLabel: step.roleLabel,
        personal: !!step.signerUserId,
      });
    }
  }

  return out;
}

// Safety first, then the things that stop work, then paperwork. A permit
// blocking a crew standing at a machine outranks a procedure revision, and an
// inbox that sorts by date alone buries the former under the latter.
const URGENCY: Record<string, number> = {
  PERMIT: 0,
  PERMIT_CLOSEOUT: 1,
  SAFETY_INCIDENT: 2,
  WORK_ORDER: 3,
  JHA: 4,
  WMS: 5,
  CORRECTIVE: 6,
  NON_CONFORMITY: 7,
  PM_CHECKLIST: 8,
  PROCEDURE: 9,
};

export function sortInbox<T extends { entityType: string; personal: boolean }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    // Something addressed to you by name comes first whatever it is: nobody
    // else can clear it.
    if (a.personal !== b.personal) return a.personal ? -1 : 1;
    return (URGENCY[a.entityType] ?? 50) - (URGENCY[b.entityType] ?? 50);
  });
}
