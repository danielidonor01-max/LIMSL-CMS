// src/lib/document-register.ts
// Document control: every numbered record in the system on one register, with
// what each one traces to (LIMSL, 16 Nov 2026).
//
// Each module already numbers its own documents (WO-, PMB-, WMS-, JHA-, PTW-,
// CMRF-, NC-, INC-, ACC-), but finding where a number came from meant knowing
// which module issued it and opening it there. The register reads them all,
// and for each names its parents: the permit's analysis, method and work
// order, the work order's batch or fault, the revision a document replaced.
// Nothing is stored here; it is a view over the records themselves, so it can
// never disagree with them.
import { db } from "@/lib/db";
import {
  workOrders,
  pmBatches,
  wmsDocuments,
  jhaDocuments,
  permits,
  correctiveMaintenance,
  nonConformities,
  safetyIncidents,
  assetCategoryChanges,
} from "@/lib/db/schema";

import type { RegisterLink, RegisterRow } from "@/lib/document-register-kinds";
export { REGISTER_KIND_LABEL, type RegisterKind, type RegisterLink, type RegisterRow } from "@/lib/document-register-kinds";

const s = (v: unknown) => (typeof v === "string" && v ? v : null);

export async function buildRegister(): Promise<RegisterRow[]> {
  const [wos, batches, wms, jha, ptw, cm, nc, inc, acc] = await Promise.all([
    db.select().from(workOrders),
    db.select().from(pmBatches),
    db.select().from(wmsDocuments),
    db.select().from(jhaDocuments),
    db.select().from(permits),
    db.select().from(correctiveMaintenance),
    db.select().from(nonConformities),
    db.select().from(safetyIncidents),
    db.select().from(assetCategoryChanges),
  ]);

  const woById = new Map(wos.map((w) => [w.id, w]));
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const wmsById = new Map(wms.map((w) => [w.id, w]));
  const jhaById = new Map(jha.map((j) => [j.id, j]));
  const ptwById = new Map(ptw.map((p) => [p.id, p]));
  const cmById = new Map(cm.map((c) => [c.id, c]));

  const woLink = (id: string | null | undefined): RegisterLink[] => {
    const w = id ? woById.get(id) : undefined;
    return w ? [{ number: w.workOrderNumber, href: `/work-orders/${w.id}` }] : [];
  };
  const batchLink = (id: string | null | undefined): RegisterLink[] => {
    const b = id ? batchById.get(id) : undefined;
    return b ? [{ number: b.workOrderNumber ?? b.batchNumber, href: `/pm-batches/${b.id}` }] : [];
  };
  const cmLink = (id: string | null | undefined): RegisterLink[] => {
    const c = id ? cmById.get(id) : undefined;
    return c ? [{ number: c.cmrfNumber, href: `/corrective/${c.id}` }] : [];
  };

  const rows: RegisterRow[] = [];

  for (const w of wos) {
    const line = !!w.batchId && w.workOrderNumber.includes("/");
    rows.push({
      key: `wo:${w.id}`,
      kind: line ? "BATCH_LINE" : "WORK_ORDER",
      number: w.workOrderNumber,
      revision: null,
      title: w.title,
      status: w.status,
      date: s(w.createdAt),
      by: null,
      href: `/work-orders/${w.id}`,
      tracesTo: [...batchLink(w.batchId), ...cmLink(w.cmsId)],
      taskNo: null,
    });
  }

  for (const b of batches) {
    rows.push({
      key: `pmb:${b.id}`,
      kind: "PM_BATCH",
      number: b.batchNumber,
      revision: null,
      title: b.workOrderNumber ? `${b.title} (work order ${b.workOrderNumber})` : b.title,
      status: b.status,
      date: s(b.createdAt),
      by: s(b.assignedByName),
      href: `/pm-batches/${b.id}`,
      tracesTo: [],
      taskNo: null,
    });
  }

  for (const w of wms) {
    const prev = w.supersedesId ? wmsById.get(w.supersedesId) : undefined;
    const wo = w.workOrderId ? woById.get(w.workOrderId) : undefined;
    rows.push({
      key: `wms:${w.id}`,
      kind: "WMS",
      number: w.wmsNumber,
      revision: w.revision ?? 0,
      title: w.title,
      status: w.status,
      date: s(w.preparedDate) ?? s(w.createdAt),
      by: s(w.preparedByName),
      href: `/wms/${w.id}`,
      tracesTo: [
        ...(w.category ? [] : woLink(w.workOrderId)),
        ...(wo?.cmsId ? cmLink(wo.cmsId) : []),
        ...(prev ? [{ number: `${prev.wmsNumber} rev ${prev.revision ?? 0}`, href: `/wms/${prev.id}` }] : []),
      ],
      taskNo: null,
    });
  }

  for (const j of jha) {
    const parent = j.wmsId ? wmsById.get(j.wmsId) : undefined;
    const prev = j.supersedesId ? jhaById.get(j.supersedesId) : undefined;
    rows.push({
      key: `jha:${j.id}`,
      kind: "JHA",
      number: j.jhaNumber,
      revision: j.revision ?? 0,
      title: j.title,
      status: j.status,
      date: s(j.preparedDate) ?? s(j.createdAt),
      by: s(j.preparedByName),
      href: `/jha/${j.id}`,
      tracesTo: [
        ...(parent ? [{ number: `${parent.wmsNumber} rev ${parent.revision ?? 0}`, href: `/wms/${parent.id}` }] : []),
        ...(prev ? [{ number: `${prev.jhaNumber} rev ${prev.revision ?? 0}`, href: `/jha/${prev.id}` }] : []),
      ],
      taskNo: null,
    });
  }

  for (const p of ptw) {
    const j = p.jhaId ? jhaById.get(p.jhaId) : undefined;
    const w = p.wmsId ? wmsById.get(p.wmsId) : undefined;
    const prev = p.supersedesPermitId ? ptwById.get(p.supersedesPermitId) : undefined;
    rows.push({
      key: `ptw:${p.id}`,
      kind: "PERMIT",
      number: p.permitNumber,
      revision: null,
      title: p.workDescription,
      status: p.status,
      date: s(p.createdAt),
      by: null,
      href: `/permits/${p.id}`,
      tracesTo: [
        ...(p.batchId ? batchLink(p.batchId) : woLink(p.workOrderId)),
        ...(j ? [{ number: j.jhaNumber, href: `/jha/${j.id}` }] : []),
        ...(w ? [{ number: w.wmsNumber, href: `/wms/${w.id}` }] : []),
        ...(prev ? [{ number: prev.permitNumber, href: `/permits/${prev.id}` }] : []),
      ],
      taskNo: s(p.taskNo),
    });
  }

  for (const c of cm) {
    rows.push({
      key: `cm:${c.id}`,
      kind: "CORRECTIVE",
      number: c.cmrfNumber,
      revision: null,
      title: c.faultDescription || "Fault report",
      status: c.status,
      date: s(c.downStartAt) ?? s(c.reportedDate),
      by: s(c.reportedByName),
      href: `/corrective/${c.id}`,
      tracesTo: woLink(c.workOrderId),
      taskNo: null,
    });
  }

  for (const n of nc) {
    const r = n as Record<string, unknown>;
    rows.push({
      key: `nc:${n.id}`,
      kind: "NON_CONFORMITY",
      number: n.ncNumber,
      revision: null,
      title: s(r.description) ?? "Non-conformity",
      status: s(r.status) ?? "",
      date: s(r.createdAt) ?? s(r.raisedDate) ?? s(r.dateRaised),
      by: s(r.raisedByName) ?? s(r.reportedByName),
      href: "/audit/non-conformity",
      tracesTo: [],
      taskNo: null,
    });
  }

  for (const i of inc) {
    const r = i as Record<string, unknown>;
    rows.push({
      key: `inc:${i.id}`,
      kind: "INCIDENT",
      number: i.incidentNumber,
      revision: null,
      title: s(r.title) ?? s(r.description) ?? "Incident",
      status: s(r.status) ?? "",
      date: s(r.occurredAt) ?? s(r.createdAt),
      by: s(r.reportedByName),
      href: `/incidents/${i.id}`,
      tracesTo: [],
      taskNo: null,
    });
  }

  for (const a of acc) {
    const r = a as Record<string, unknown>;
    rows.push({
      key: `acc:${a.id}`,
      kind: "CATEGORY_CHANGE",
      number: a.changeNumber,
      revision: null,
      title: s(r.proposedLabel) ?? s(r.previousLabel) ?? "Category change",
      status: s(r.status) ?? "",
      date: s(r.createdAt),
      by: s(r.proposedByName) ?? s(r.createdByName),
      href: `/asset-categories?change=${a.id}`,
      tracesTo: [],
      taskNo: null,
    });
  }

  return sortRegister(rows);
}

// Newest first; within a day, by number so a batch's lines read in order.
export function sortRegister<T extends { date: string | null; number: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const d = (b.date ?? "").slice(0, 10).localeCompare((a.date ?? "").slice(0, 10));
    return d !== 0 ? d : a.number.localeCompare(b.number, undefined, { numeric: true });
  });
}
