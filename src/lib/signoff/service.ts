// src/lib/signoff/service.ts
import { db } from "@/lib/db";
import { signoffs } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chainFor, isStepUnlocked } from "./chains";

export { isStepUnlocked };

// Create the sign-off chain rows for an entity if they don't already exist.
export async function ensureSignoffChain(entityType: string, entityId: string) {
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
  return rows;
}

export async function getSignoffChain(entityType: string, entityId: string) {
  return db
    .select()
    .from(signoffs)
    .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)))
    .orderBy(asc(signoffs.stepOrder));
}
