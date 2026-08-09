// src/lib/maintenance/escalation-store.ts
// The persistence half of the escalation policy: what each person was last
// told, what has been snoozed, and the admin-set policy itself. All decisions
// live in ./escalation-policy.ts, which is pure and tested.
import { db } from "@/lib/db";
import { appSettings, escalationDigests, escalationSnoozes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  DEFAULT_ESCALATION_POLICY,
  normalisePolicy,
  isSnoozed,
  type EscalationPolicy,
  type Snooze,
} from "./escalation-policy";

export async function getEscalationPolicy(): Promise<EscalationPolicy> {
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.id, "singleton")).limit(1);
    if (!row?.escalationPolicy) return DEFAULT_ESCALATION_POLICY;
    return normalisePolicy(JSON.parse(row.escalationPolicy));
  } catch {
    // A malformed policy must not stop escalation entirely, that would turn a
    // bad settings save into total silence, which is the worst failure here.
    return DEFAULT_ESCALATION_POLICY;
  }
}

export async function saveEscalationPolicy(policy: unknown): Promise<EscalationPolicy> {
  const clean = normalisePolicy(policy);
  await db
    .update(appSettings)
    .set({ escalationPolicy: JSON.stringify(clean), updatedAt: new Date().toISOString() })
    .where(eq(appSettings.id, "singleton"));
  return clean;
}

// What this person was last told, for this scope.
export async function lastDigest(
  userId: string,
  scope: string,
): Promise<{ itemKeys: string[]; sentAt: string } | null> {
  try {
    const [row] = await db
      .select()
      .from(escalationDigests)
      .where(and(eq(escalationDigests.userId, userId), eq(escalationDigests.scope, scope)))
      .limit(1);
    if (!row) return null;
    const parsed = JSON.parse(row.itemKeys);
    return { itemKeys: Array.isArray(parsed) ? parsed : [], sentAt: row.sentAt };
  } catch {
    return null;
  }
}

// Recorded AFTER a successful send, so a delivery failure does not convince the
// system it has already told someone.
export async function recordDigest(userId: string, scope: string, itemKeys: string[]): Promise<void> {
  const sentAt = new Date().toISOString();
  const existing = await lastDigest(userId, scope);
  if (existing) {
    await db
      .update(escalationDigests)
      .set({ itemKeys: JSON.stringify(itemKeys), sentAt })
      .where(and(eq(escalationDigests.userId, userId), eq(escalationDigests.scope, scope)));
    return;
  }
  await db.insert(escalationDigests).values({
    id: nanoid(),
    userId,
    scope,
    itemKeys: JSON.stringify(itemKeys),
    sentAt,
  });
}

export async function activeSnoozes(now: Date = new Date()): Promise<Map<string, Snooze>> {
  const rows = await db.select().from(escalationSnoozes);
  const map = new Map<string, Snooze>();
  for (const r of rows) {
    const snooze: Snooze = { until: r.snoozedUntil, reason: r.reason };
    if (isSnoozed(snooze, now)) map.set(`${r.entityType}:${r.entityId}`, snooze);
  }
  return map;
}

export async function setSnooze(input: {
  entityType: string;
  entityId: string;
  until: string;
  reason: string;
  byId?: string | null;
  byName?: string | null;
}): Promise<void> {
  const existing = await db
    .select()
    .from(escalationSnoozes)
    .where(
      and(eq(escalationSnoozes.entityType, input.entityType), eq(escalationSnoozes.entityId, input.entityId)),
    )
    .limit(1);

  const values = {
    snoozedUntil: input.until,
    reason: input.reason,
    snoozedById: input.byId ?? null,
    snoozedByName: input.byName ?? null,
  };

  if (existing.length) {
    await db
      .update(escalationSnoozes)
      .set(values)
      .where(eq(escalationSnoozes.id, existing[0].id));
    return;
  }
  await db.insert(escalationSnoozes).values({
    id: nanoid(),
    entityType: input.entityType,
    entityId: input.entityId,
    ...values,
  });
}
