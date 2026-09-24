// src/lib/hse/standing-documents.ts
// A method statement is not a form you fill in for each job.
//
// How you service a CNC light-duty machine does not change because it is
// October rather than March. The method is written once for the category,
// reviewed, approved, and then it stands — every PM of those machines is
// carried out under it until somebody revises it. That is the same treatment
// the maintenance procedure gets, and for the same reason: it is a controlled
// document, and rewriting it per job would mean nobody could say which method
// a particular job was actually done under.
//
// The hazard analysis hangs off it and inherits that. What makes the pair work
// is one number: the JHA records the WMS revision it was written against. When
// a machine joins the category and the method is revised, that pin is what
// proves the hazards were assessed against the old work — and what stops a
// permit being issued on an analysis that has been overtaken.
//
// Permits are the exception, and deliberately. A permit has a start, a
// validity, an expiry and a hand-back: it authorises work in a window. So a
// fresh one is raised for each PM cycle, against the standing pair.
import { db } from "@/lib/db";
import { wmsDocuments, jhaDocuments } from "@/lib/db/schema";
import { and, eq, desc, isNotNull } from "drizzle-orm";

export type WmsRow = typeof wmsDocuments.$inferSelect;
export type JhaRow = typeof jhaDocuments.$inferSelect;

/**
 * The method statement in force for a category: approved, highest revision.
 * Null means this category has no method yet, which is the thing the assignee
 * is expected to go and write.
 */
export async function currentWmsForCategory(category: string): Promise<WmsRow | null> {
  const [row] = await db
    .select()
    .from(wmsDocuments)
    .where(and(eq(wmsDocuments.category, category), eq(wmsDocuments.status, "APPROVED")))
    .orderBy(desc(wmsDocuments.revision))
    .limit(1);
  return row ?? null;
}

/** Every revision of a category's method, newest first. The document's history. */
export async function wmsHistoryForCategory(category: string): Promise<WmsRow[]> {
  return db
    .select()
    .from(wmsDocuments)
    .where(eq(wmsDocuments.category, category))
    .orderBy(desc(wmsDocuments.revision));
}

/** The hazard analysis written against a given method statement, newest first. */
export async function jhaForWms(wmsId: string): Promise<JhaRow | null> {
  const [row] = await db
    .select()
    .from(jhaDocuments)
    .where(eq(jhaDocuments.wmsId, wmsId))
    .orderBy(desc(jhaDocuments.revision))
    .limit(1);
  return row ?? null;
}

/** Categories that have a standing method statement at all. */
export async function categoriesWithStandingWms(): Promise<string[]> {
  const rows = await db
    .select({ category: wmsDocuments.category })
    .from(wmsDocuments)
    .where(and(isNotNull(wmsDocuments.category), eq(wmsDocuments.status, "APPROVED")));
  return [...new Set(rows.map((r) => r.category).filter((c): c is string => !!c))];
}

// ─── The rules, pure so they can be tested and so the UI and the API gate
//     cannot disagree about them ────────────────────────────────────────────

/**
 * Whether an analysis still matches the method it was written against.
 *
 * An analysis with no recorded revision is a historical one from before the
 * method statements became standing documents. It is treated as current rather
 * than retroactively condemned: rewriting the past is not this function's job,
 * and the next revision will pin it properly.
 */
export function jhaMatchesWms(
  jha: { wmsRevision?: number | null } | null | undefined,
  wms: { revision?: number | null } | null | undefined,
): boolean {
  if (!jha || !wms) return false;
  if (jha.wmsRevision === null || jha.wmsRevision === undefined) return true;
  return jha.wmsRevision === (wms.revision ?? 0);
}

export type PermitReadiness =
  | { ok: true }
  | { ok: false; reason: string; blockedBy: "NO_WMS" | "WMS_UNAPPROVED" | "NO_JHA" | "JHA_UNAPPROVED" | "JHA_STALE" };

/**
 * Whether a permit may be raised for a category right now.
 *
 * This is the "no permit, no PM" rule with the revision check added. A stale
 * analysis blocks a NEW permit; it deliberately says nothing about permits
 * already live, because stopping work that is already under way and already
 * authorised is a decision for a person, not a consequence of somebody editing
 * a document.
 */
export function permitReadiness(
  wms: { revision?: number | null; status?: string | null; wmsNumber?: string | null } | null | undefined,
  jha: { wmsRevision?: number | null; status?: string | null; jhaNumber?: string | null } | null | undefined,
): PermitReadiness {
  if (!wms) {
    return {
      ok: false,
      blockedBy: "NO_WMS",
      reason:
        "There is no method statement for this category yet. Write one and have it approved — " +
        "the hazard analysis is built from it, and the permit rests on both.",
    };
  }
  if (wms.status !== "APPROVED") {
    return {
      ok: false,
      blockedBy: "WMS_UNAPPROVED",
      reason: `${wms.wmsNumber ?? "The method statement"} is ${String(wms.status ?? "").toLowerCase().replace(/_/g, " ")}, not approved.`,
    };
  }
  if (!jha) {
    return {
      ok: false,
      blockedBy: "NO_JHA",
      reason: `${wms.wmsNumber ?? "The method statement"} has no hazard analysis. HSE builds one from it before a permit can be raised.`,
    };
  }
  if (jha.status !== "APPROVED") {
    return {
      ok: false,
      blockedBy: "JHA_UNAPPROVED",
      reason: `${jha.jhaNumber ?? "The hazard analysis"} is ${String(jha.status ?? "").toLowerCase().replace(/_/g, " ")}, not approved.`,
    };
  }
  if (!jhaMatchesWms(jha, wms)) {
    return {
      ok: false,
      blockedBy: "JHA_STALE",
      reason:
        `${jha.jhaNumber ?? "The hazard analysis"} was written against revision ${jha.wmsRevision} of ` +
        `${wms.wmsNumber ?? "the method statement"}, which is now at revision ${wms.revision}. ` +
        `The method has changed since the hazards were assessed, so HSE must revise the analysis ` +
        `before another permit is issued. Permits already live are not affected.`,
    };
  }
  return { ok: true };
}

/** What a category's standing pair looks like on screen. */
export type StandingPair = {
  category: string;
  wms: WmsRow | null;
  jha: JhaRow | null;
  readiness: PermitReadiness;
};

export async function standingPairFor(category: string): Promise<StandingPair> {
  const wms = await currentWmsForCategory(category);
  const jha = wms ? await jhaForWms(wms.id) : null;
  return { category, wms, jha, readiness: permitReadiness(wms, jha) };
}
