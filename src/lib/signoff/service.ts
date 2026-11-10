// src/lib/signoff/service.ts
import { db } from "@/lib/db";
import { signoffs, jhaDocuments, wmsDocuments } from "@/lib/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { chainFor, isStepUnlocked } from "./chains";
import { notifyNextSigner } from "@/lib/notifications";

export { isStepUnlocked };

type Person = { id: string; name: string };
type BoundSigners = { PERMIT_HOLDER?: Person | null; WMS_ORIGINATOR?: Person | null };

// The Foreman whose method statement a JHA is written against signs its review
// step (LIMSL, November 2026): he is the one who knows whether the hazards
// listed are the job as it will be done. That is the person who originated the
// WMS, read from its first signature, or its preparer if it predates them.
async function wmsOriginatorFor(jhaId: string): Promise<Person | null> {
  const [jha] = await db.select({ wmsId: jhaDocuments.wmsId }).from(jhaDocuments).where(eq(jhaDocuments.id, jhaId)).limit(1);
  if (!jha?.wmsId) return null;
  const [first] = await db
    .select()
    .from(signoffs)
    .where(and(eq(signoffs.entityType, "WMS"), eq(signoffs.entityId, jha.wmsId), eq(signoffs.stepOrder, 1)))
    .limit(1);
  if (first?.status === "SIGNED" && first.signedById) return { id: first.signedById, name: first.signedByName ?? "" };
  const [wms] = await db
    .select({ id: wmsDocuments.preparedById, name: wmsDocuments.preparedByName })
    .from(wmsDocuments)
    .where(eq(wmsDocuments.id, jha.wmsId))
    .limit(1);
  return wms?.id ? { id: wms.id, name: wms.name ?? "" } : null;
}

// Create the sign-off chain rows for an entity if they don't already exist.
// On first creation, notify whoever must sign the first step.
export async function ensureSignoffChain(
  entityType: string,
  entityId: string,
  reference?: string,
  // Named signers for steps the chain binds to a person rather than a role.
  boundSigners?: BoundSigners,
) {
  const existing = await db
    .select()
    .from(signoffs)
    .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)));
  if (existing.length > 0) {
    // A chain created under an older definition (e.g. the 5-step WMS chain)
    // is rebuilt from the current one, but ONLY while nobody has acted on it:
    // a signature or rejection is evidence and is never discarded here, and a
    // bound signer can't be reconstructed without the caller's context.
    const current = chainFor(entityType);
    const ordered = [...existing].sort((a, b) => a.stepOrder - b.stepOrder);
    const stale =
      current.length > 0 &&
      (ordered.length !== current.length ||
        ordered.some((s, i) => s.role !== current[i].role || s.roleLabel !== current[i].roleLabel));
    const untouched = ordered.every((s) => s.status === "PENDING" && !s.signerUserId);
    if (!(stale && untouched)) return existing;
    await db
      .delete(signoffs)
      .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)));
  }

  const steps = chainFor(entityType);
  if (steps.length === 0) return [];
  if (steps.some((s) => s.signer === "WMS_ORIGINATOR") && boundSigners?.WMS_ORIGINATOR === undefined) {
    boundSigners = { ...boundSigners, WMS_ORIGINATOR: await wmsOriginatorFor(entityId) };
  }

  const rows = steps.map((s, i) => {
    const bound = s.signer ? boundSigners?.[s.signer] : null;
    return {
      id: nanoid(),
      entityType,
      entityId,
      stepOrder: i + 1,
      role: s.role,
      roleLabel: s.roleLabel,
      required: s.required,
      signerUserId: bound?.id ?? null,
      signerUserName: bound?.name ?? null,
      status: "PENDING" as const,
    };
  });
  // Two concurrent first-accesses both reach this insert; the unique index on
  // (entity_type, entity_id, step_order) makes the loser a no-op instead of a
  // duplicated chain, and both callers return the canonical rows.
  await db.insert(signoffs).values(rows).onConflictDoNothing();
  const canonical = await db
    .select()
    .from(signoffs)
    .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)))
    .orderBy(asc(signoffs.stepOrder));

  // Best-effort, never let a notification failure abort chain creation. Only
  // the caller whose rows actually landed notifies, so a lost race can't send
  // the first-signer request twice.
  if (canonical[0]?.id === rows[0].id) {
    try {
      await notifyNextSigner(entityType, entityId, canonical, reference);
    } catch (err) {
      console.warn("ensureSignoffChain: notify failed", err);
    }
  }

  return canonical;
}

export async function getSignoffChain(entityType: string, entityId: string) {
  return db
    .select()
    .from(signoffs)
    .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)))
    .orderBy(asc(signoffs.stepOrder));
}

// Rework path: after a rejection (or a content change to an already-signed
// document) the old signatures no longer attest to anything, drop the chain and
// start a fresh one so every step must sign the CURRENT content. The old steps'
// audit-log entries remain; only the live chain resets.
export async function resetSignoffChain(
  entityType: string,
  entityId: string,
  reference?: string,
  boundSigners?: BoundSigners,
) {
  await db
    .delete(signoffs)
    .where(and(eq(signoffs.entityType, entityType), eq(signoffs.entityId, entityId)));
  return ensureSignoffChain(entityType, entityId, reference, boundSigners);
}
