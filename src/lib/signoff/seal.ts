// src/lib/signoff/seal.ts
// Taking the hash when a document's approval chain completes, and checking it
// again later against whatever the record says now.
//
// The canonicalisers below decide what "the document" means for each type, and
// that choice is the whole design. Hash too little and a change to something
// material passes unnoticed. Hash too much and the seal breaks on things nobody
// would call a change: a status field the reconciler rewrites hourly, an
// updatedAt, a cached name copied from another table. Each one below includes
// what appears on the printed sheet and what would alter its meaning, and
// nothing that moves on its own.

import { db } from "@/lib/db";
import {
  documentSeals,
  permits,
  jhaDocuments,
  wmsDocuments,
  safetyIncidents,
  correctiveMaintenance,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { contentDigest, codeFromDigest, verifyDigest, type SealVerdict } from "@/lib/verification";
import { getSignoffChain } from "@/lib/signoff/service";

export type SealableType = "PERMIT" | "JHA" | "WMS" | "SAFETY_INCIDENT" | "CORRECTIVE";

export const SEALABLE: SealableType[] = ["PERMIT", "JHA", "WMS", "SAFETY_INCIDENT", "CORRECTIVE"];

export const SEAL_LABEL: Record<SealableType, string> = {
  PERMIT: "Permit to work",
  JHA: "Job hazard analysis",
  WMS: "Work method statement",
  SAFETY_INCIDENT: "Safety incident",
  CORRECTIVE: "Corrective maintenance record",
};

export const SEAL_HREF: Record<SealableType, (id: string) => string> = {
  PERMIT: (id) => `/permits/${id}`,
  JHA: (id) => `/jha/${id}`,
  WMS: (id) => `/wms/${id}`,
  SAFETY_INCIDENT: (id) => `/incidents/${id}`,
  CORRECTIVE: (id) => `/corrective/${id}`,
};

type Content = { reference: string; fields: Record<string, unknown> } | null;

async function contentFor(entityType: string, entityId: string): Promise<Content> {
  switch (entityType) {
    case "PERMIT": {
      const [r] = await db.select().from(permits).where(eq(permits.id, entityId)).limit(1);
      if (!r) return null;
      return {
        reference: r.permitNumber,
        fields: {
          permitNumber: r.permitNumber,
          workDescription: r.workDescription,
          equipmentId: r.equipmentId,
          hazardsIdentified: r.hazardsIdentified,
          startDate: r.startDate,
          validityDays: r.validityDays,
          permitHolderId: r.permitHolderId,
          workTypes: r.workTypes,
        },
      };
    }
    case "JHA": {
      const [r] = await db.select().from(jhaDocuments).where(eq(jhaDocuments.id, entityId)).limit(1);
      if (!r) return null;
      return {
        reference: r.jhaNumber,
        fields: {
          jhaNumber: r.jhaNumber,
          title: r.title,
          revision: r.revision,
          wmsId: r.wmsId,
          workArea: r.workArea,
          // The hazards, controls and ratings. The document IS this.
          steps: r.steps,
          ppeRequired: r.ppeRequired,
          emergencyArrangements: r.emergencyArrangements,
        },
      };
    }
    case "WMS": {
      const [r] = await db.select().from(wmsDocuments).where(eq(wmsDocuments.id, entityId)).limit(1);
      if (!r) return null;
      return {
        reference: r.wmsNumber,
        fields: {
          wmsNumber: r.wmsNumber,
          title: r.title,
          revision: r.revision,
          purpose: r.purpose,
          scope: r.scope,
          workProcedureSteps: r.workProcedureSteps,
          hseRequirements: r.hseRequirements,
          equipmentIds: r.equipmentIds,
        },
      };
    }
    case "SAFETY_INCIDENT": {
      const [r] = await db.select().from(safetyIncidents).where(eq(safetyIncidents.id, entityId)).limit(1);
      if (!r) return null;
      return {
        reference: r.incidentNumber,
        fields: {
          incidentNumber: r.incidentNumber,
          type: r.type,
          occurredAt: r.occurredAt,
          description: r.description,
          rootCause: r.rootCause,
          correctiveAction: r.correctiveAction,
        },
      };
    }
    case "CORRECTIVE": {
      const [r] = await db
        .select()
        .from(correctiveMaintenance)
        .where(eq(correctiveMaintenance.id, entityId))
        .limit(1);
      if (!r) return null;
      return {
        reference: r.cmrfNumber,
        fields: {
          cmrfNumber: r.cmrfNumber,
          equipmentId: r.equipmentId,
          faultDescription: r.faultDescription,
          rootCauseCategory: r.rootCauseCategory,
          verifiedRootCause: r.verifiedRootCause,
          correctiveActions: r.correctiveActions,
          downStartAt: r.downStartAt,
          downEndAt: r.downEndAt,
        },
      };
    }
    default:
      return null;
  }
}

/**
 * Seal a record, once.
 *
 * Idempotent by (entityType, entityId): a seal is a statement about a moment,
 * and re-taking it after the record changed would quietly replace the evidence
 * with a fresh hash of the altered document, which is the exact failure the
 * seal exists to catch.
 */
export async function sealDocument(entityType: string, entityId: string) {
  if (!SEALABLE.includes(entityType as SealableType)) return null;

  const existing = await db
    .select()
    .from(documentSeals)
    .where(and(eq(documentSeals.entityType, entityType), eq(documentSeals.entityId, entityId)))
    .limit(1);
  if (existing.length) return existing[0];

  const content = await contentFor(entityType, entityId);
  if (!content) return null;

  // The signatures are part of what was sealed. A document whose content is
  // unchanged but whose approvals were altered is still a different document.
  const chain = await getSignoffChain(entityType, entityId);
  const hash = contentDigest({
    ...content.fields,
    signatures: chain
      .filter((s) => s.status === "SIGNED")
      .map((s) => ({ role: s.role, by: s.signedById, at: s.signedAt })),
  });

  const row = {
    id: nanoid(),
    entityType,
    entityId,
    code: codeFromDigest(hash),
    contentHash: hash,
    reference: content.reference,
    sealedAt: new Date().toISOString(),
  };

  try {
    await db.insert(documentSeals).values(row);
  } catch {
    // The unique index on `code` is the backstop against a collision. Losing a
    // seal must never lose the signature that triggered it, so this is not
    // fatal: the document simply has no printed code until somebody notices.
    return null;
  }
  return row;
}

export async function sealFor(entityType: string, entityId: string) {
  const [row] = await db
    .select()
    .from(documentSeals)
    .where(and(eq(documentSeals.entityType, entityType), eq(documentSeals.entityId, entityId)))
    .limit(1);
  return row ?? null;
}

/** Recompute the digest now and compare it with what was sealed. */
export async function verifySeal(code: string): Promise<
  | { found: false }
  | {
      found: true;
      verdict: SealVerdict;
      entityType: string;
      entityId: string;
      reference: string | null;
      sealedAt: string;
    }
> {
  const [seal] = await db.select().from(documentSeals).where(eq(documentSeals.code, code)).limit(1);
  if (!seal) return { found: false };

  const content = await contentFor(seal.entityType, seal.entityId);
  if (!content) {
    // The record is gone. That is not "matches" and it is not a typo either.
    return {
      found: true,
      verdict: { status: "ALTERED" },
      entityType: seal.entityType,
      entityId: seal.entityId,
      reference: seal.reference,
      sealedAt: seal.sealedAt,
    };
  }

  const chain = await getSignoffChain(seal.entityType, seal.entityId);
  const current = contentDigest({
    ...content.fields,
    signatures: chain
      .filter((s) => s.status === "SIGNED")
      .map((s) => ({ role: s.role, by: s.signedById, at: s.signedAt })),
  });

  return {
    found: true,
    verdict: verifyDigest(seal.contentHash, current),
    entityType: seal.entityType,
    entityId: seal.entityId,
    reference: seal.reference,
    sealedAt: seal.sealedAt,
  };
}
