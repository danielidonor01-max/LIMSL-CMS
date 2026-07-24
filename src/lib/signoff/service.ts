// src/lib/signoff/service.ts
import { db } from "@/lib/db";
import { signoffs } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chainFor, isStepUnlocked } from "./chains";
import { notifyNextSigner } from "@/lib/notifications";

export { isStepUnlocked };

// Create the sign-off chain rows for an entity if they don't already exist.
// On first creation, notify whoever must sign the first step.
export async function ensureSignoffChain(entityType: string, entityId: string, reference?: string) {
  const existing = await db
    .select()
    .from(signoffs)
    .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)));
  if (existing.length > 0) return existing;

  const steps = chainFor(entityType);
  if (steps.length === 0) return [];

  const rows = steps.map((s, i) => ({
    id: nanoid(),
    entityType,
    entityId,
    stepOrder: i + 1,
    role: s.role,
    roleLabel: s.roleLabel,
    required: s.required,
    status: "PENDING" as const,
  }));
  await db.insert(signoffs).values(rows);

  // Best-effort — never let a notification failure abort chain creation.
  try {
    await notifyNextSigner(entityType, entityId, rows, reference);
  } catch (err) {
    console.warn("ensureSignoffChain: notify failed", err);
  }

  return rows;
}

export async function getSignoffChain(entityType: string, entityId: string) {
  return db
    .select()
    .from(signoffs)
    .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)))
    .orderBy(asc(signoffs.stepOrder));
}

// Rework path: after a rejection (or a content change to an already-signed
// document) the old signatures no longer attest to anything — drop the chain and
// start a fresh one so every step must sign the CURRENT content. The old steps'
// audit-log entries remain; only the live chain resets.
export async function resetSignoffChain(entityType: string, entityId: string, reference?: string) {
  await db
    .delete(signoffs)
    .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)));
  return ensureSignoffChain(entityType, entityId, reference);
}
