// src/lib/equipment-log.ts
// The machine lifetime log. logEquipmentEvent() is called by the maintenance
// flows (PM/CM completion, status/location change, diagnosis) to record an
// event; buildTimeline() merges these explicit entries with events DERIVED from
// the source tables so the History tab shows one unified, deduped timeline.
import { db } from "@/lib/db";
import {
  equipmentLog,
  workOrders,
  correctiveMaintenance,
  nonConformities,
  equipmentDocuments,
} from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

export type LogCategory =
  | "PM" | "CM" | "INSPECTION" | "ACCIDENT" | "TRANSFER"
  | "DIAGNOSIS" | "STATUS" | "NOTE" | "CALIBRATION" | "DOCUMENT" | "OTHER";

export type TimelineEvent = {
  id: string;
  category: LogCategory;
  title: string;
  detail: string | null;
  href: string | null;
  source: "AUTO" | "MANUAL" | "DERIVED";
  performedByName: string | null;
  occurredAt: string;
  refType?: string | null;
  refId?: string | null;
};

// Record an explicit log entry. Best-effort at call sites — a logging failure
// must never fail the underlying maintenance action.
export async function logEquipmentEvent(entry: {
  equipmentId: string;
  category: LogCategory;
  title: string;
  detail?: string | null;
  refType?: string | null;
  refId?: string | null;
  href?: string | null;
  source?: "AUTO" | "MANUAL";
  performedById?: string | null;
  performedByName?: string | null;
  occurredAt?: string;
  metadata?: unknown;
}): Promise<string> {
  const id = nanoid();
  await db.insert(equipmentLog).values({
    id,
    equipmentId: entry.equipmentId,
    category: entry.category,
    title: entry.title.slice(0, 200),
    detail: entry.detail ? String(entry.detail).slice(0, 2000) : null,
    refType: entry.refType ?? null,
    refId: entry.refId ?? null,
    href: entry.href ?? null,
    source: entry.source ?? "MANUAL",
    performedById: entry.performedById ?? null,
    performedByName: entry.performedByName ?? null,
    occurredAt: entry.occurredAt ?? new Date().toISOString(),
    metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
  });
  return id;
}

const day = (s: string | null | undefined) => (s ?? "").slice(0, 10);

// Unified, newest-first timeline for one machine: explicit log entries +
// derived events. Derived events for a source that already produced an explicit
// AUTO entry (same refType+refId) are suppressed to avoid double-listing.
export async function buildTimeline(equipmentId: string): Promise<TimelineEvent[]> {
  const [logged, wos, cms, ncs, docs] = await Promise.all([
    db.select().from(equipmentLog).where(eq(equipmentLog.equipmentId, equipmentId)),
    db.select().from(workOrders).where(eq(workOrders.equipmentId, equipmentId)),
    db.select().from(correctiveMaintenance).where(eq(correctiveMaintenance.equipmentId, equipmentId)),
    db.select().from(nonConformities).where(eq(nonConformities.equipmentId, equipmentId)),
    db.select().from(equipmentDocuments).where(eq(equipmentDocuments.equipmentId, equipmentId)),
  ]);

  const explicitRefs = new Set(logged.filter((l) => l.refId).map((l) => `${l.refType}:${l.refId}`));
  const events: TimelineEvent[] = [];

  for (const l of logged) {
    events.push({
      id: l.id,
      category: l.category as LogCategory,
      title: l.title,
      detail: l.detail,
      href: l.href,
      source: l.source as "AUTO" | "MANUAL",
      performedByName: l.performedByName,
      occurredAt: l.occurredAt,
      refType: l.refType,
      refId: l.refId,
    });
  }

  for (const w of wos) {
    if (explicitRefs.has(`work_order:${w.id}`)) continue;
    events.push({
      id: `wo-${w.id}`,
      category: w.type === "PREVENTIVE" ? "PM" : w.type === "INSPECTION" ? "INSPECTION" : "CM",
      title: `${w.type} work order ${w.workOrderNumber} — ${w.status.replace(/_/g, " ").toLowerCase()}`,
      detail: w.title,
      href: `/work-orders/${w.id}`,
      source: "DERIVED",
      performedByName: w.technicianName ?? null,
      occurredAt: w.completionDate || w.startDate || w.plannedDate || day(w.createdAt),
    });
  }

  for (const c of cms) {
    if (explicitRefs.has(`corrective_maintenance:${c.id}`)) continue;
    events.push({
      id: `cm-${c.id}`,
      category: "CM",
      title: `Corrective ${c.cmrfNumber} — ${(c.status ?? "").toLowerCase() || "logged"}`,
      detail: c.faultDescription || c.observedFault || null,
      href: `/corrective/${c.id}`,
      source: "DERIVED",
      performedByName: c.reportedByName ?? null,
      occurredAt: c.closeOutDate || c.reportedDate || day(c.createdAt),
    });
  }

  for (const n of ncs) {
    events.push({
      id: `nc-${n.id}`,
      category: n.type === "SAFETY_INCIDENT" ? "ACCIDENT" : "INSPECTION",
      title: `${(n.type ?? "Non-conformity").replace(/_/g, " ")} — ${n.ncNumber ?? ""}`.trim(),
      detail: n.description ?? null,
      href: `/audit/non-conformity`,
      source: "DERIVED",
      performedByName: n.detectedBy ?? null,
      occurredAt: n.detectedDate || day(n.createdAt),
    });
  }

  for (const d of docs) {
    events.push({
      id: `doc-${d.id}`,
      category: "DOCUMENT",
      title: `Document added — ${d.title}`,
      detail: d.docType?.replace(/_/g, " ") ?? null,
      href: d.fileUrl ?? null,
      source: "DERIVED",
      performedByName: d.uploadedBy ?? null,
      occurredAt: d.issuedDate || day(d.createdAt),
    });
  }

  return events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
}
