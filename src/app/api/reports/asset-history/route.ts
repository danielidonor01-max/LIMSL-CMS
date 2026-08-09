// src/app/api/reports/asset-history/route.ts
// The per-asset maintenance dossier, the single most common auditor request
// ("show me everything you did to LEE/PE/0012 last year") and the one the system
// could not answer. Assembles one date-ranged, chronological record set for a
// machine: work orders, PM checklists with their sign-off state, corrective
// records with root cause and downtime, non-conformities, calibration events,
// documents and the machine log.
//
// buildTimeline() is reused for the explicit machine-log entries and for its
// de-duplication key (a source that already wrote an AUTO log entry is not
// listed twice), but it is unbounded, so everything here is range-filtered and
// the source records are re-read to carry the detail a dossier needs.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  workOrders,
  pmChecklists,
  correctiveMaintenance,
  nonConformities,
  equipmentDocuments,
  calibrationRecords,
  calibrationEvents,
  signoffs,
} from "@/lib/db/schema";
import { eq, inArray, or } from "drizzle-orm";
import { buildTimeline } from "@/lib/equipment-log";
import { chainSummary } from "@/lib/signoff/chains";
import { getWorkSettings } from "@/lib/settings";
import { isProductionDay, productiveHoursPerDay, type WorkSettings } from "@/lib/worktime";
import { isoSeconds } from "@/lib/utils";

export type DossierEvent = {
  date: string; // YYYY-MM-DD
  category: string; // display label
  reference: string; // document number the auditor cites
  title: string;
  detail: string;
  performedBy: string;
  state: string; // status and/or approval position
  href: string | null;
};

const MAX_RANGE_DAYS = 3660; // ~10 years, a guard, not a policy
const day = (v: string | null | undefined) => (v ?? "").slice(0, 10);

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normaliseDate(raw: string | null, fallback: string): string {
  const value = (raw ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return fallback;
}

// Planned production hours for one machine across the range, the availability
// baseline, using the same model as the KPI layer (production calendar from the
// Super-Admin working-hours settings), just ranged instead of per-month.
function plannedHoursInRange(from: string, to: string, s: WorkSettings): number {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  let days = 0;
  let guard = 0;
  const cursor = new Date(start);
  while (cursor <= end && guard++ < MAX_RANGE_DAYS) {
    if (isProductionDay(cursor.getDay(), s)) days++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days * productiveHoursPerDay(s);
}

const signedLabel = (chain: { required: boolean | null; status: string }[]) => {
  if (!chain.length) return "";
  const { total, signed, complete } = chainSummary(chain);
  return complete ? "fully signed" : `${signed}/${total} signed`;
};

const joinDetail = (parts: (string | null | undefined | false)[]) =>
  parts.filter(Boolean).join(" · ");

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const assetParam = (params.get("assetId") ?? "").trim();
    if (!assetParam) {
      return NextResponse.json({ error: "An assetId is required." }, { status: 400 });
    }

    const slashed = assetParam.replace(/-/g, "/");
    const [asset] = await db
      .select()
      .from(equipment)
      .where(or(eq(equipment.assetId, slashed), eq(equipment.assetId, assetParam), eq(equipment.id, assetParam)))
      .limit(1);
    if (!asset) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const today = new Date();
    const yearAgo = new Date(today);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const to = normaliseDate(params.get("to"), isoDate(today));
    const from = normaliseDate(params.get("from"), isoDate(yearAgo));
    const inRange = (d: string | null | undefined) => {
      const v = day(d);
      return !!v && v >= from && v <= to;
    };

    const [timeline, wos, checklists, cms, ncs, docs, instruments, workSettings] = await Promise.all([
      buildTimeline(asset.id),
      db.select().from(workOrders).where(eq(workOrders.equipmentId, asset.id)),
      db.select().from(pmChecklists).where(eq(pmChecklists.equipmentId, asset.id)),
      db.select().from(correctiveMaintenance).where(eq(correctiveMaintenance.equipmentId, asset.id)),
      db.select().from(nonConformities).where(eq(nonConformities.equipmentId, asset.id)),
      db.select().from(equipmentDocuments).where(eq(equipmentDocuments.equipmentId, asset.id)),
      db.select().from(calibrationRecords).where(eq(calibrationRecords.equipmentId, asset.id)),
      getWorkSettings(),
    ]);

    const instrumentIds = instruments.map((i) => i.id);
    const calEvents = instrumentIds.length
      ? await db.select().from(calibrationEvents).where(inArray(calibrationEvents.instrumentId, instrumentIds))
      : [];

    // Sign-off state for every record in the dossier that carries a chain.
    const signoffIds = [...checklists.map((c) => c.id), ...cms.map((c) => c.id), ...ncs.map((n) => n.id)];
    const chainRows = signoffIds.length
      ? await db.select().from(signoffs).where(inArray(signoffs.entityId, signoffIds))
      : [];
    const chains = new Map<string, { required: boolean | null; status: string }[]>();
    for (const row of chainRows) {
      const key = `${row.entityType}:${row.entityId}`;
      const list = chains.get(key) ?? [];
      list.push({ required: row.required, status: row.status });
      chains.set(key, list);
    }
    const chainFor = (entityType: string, id: string) => signedLabel(chains.get(`${entityType}:${id}`) ?? []);

    const events: DossierEvent[] = [];

    const woNumber = new Map(wos.map((w) => [w.id, w.workOrderNumber]));
    const cmNumber = new Map(cms.map((c) => [c.id, c.cmrfNumber]));

    // 1. Work orders.
    const wosInRange = wos.filter((w) =>
      inRange(w.completionDate || w.startDate || w.plannedDate || w.createdAt),
    );
    for (const w of wosInRange) {
      events.push({
        date: day(w.completionDate || w.startDate || w.plannedDate || w.createdAt),
        category: "Work order",
        reference: w.workOrderNumber,
        title: w.title,
        detail: joinDetail([
          w.type.replace(/_/g, " "),
          w.priority && `${w.priority.toLowerCase()} priority`,
          w.description,
          w.actualDuration != null && `${w.actualDuration} h actual`,
        ]),
        performedBy: w.technicianName ?? "-",
        state: w.status.replace(/_/g, " "),
        href: `/work-orders/${w.id}`,
      });
    }

    // 2. PM checklists, the signed record, not just the work order that framed it.
    const checklistsInRange = checklists.filter((c) => inRange(c.date));
    for (const c of checklistsInRange) {
      const signatures = [
        c.technicianSignature ? `technician signed${c.technicianName ? ` (${c.technicianName})` : ""}` : "technician unsigned",
        c.supervisorSignature ? `supervisor signed${c.supervisorName ? ` (${c.supervisorName})` : ""}` : "supervisor unsigned",
      ].join(", ");
      events.push({
        date: day(c.date),
        category: "PM checklist",
        reference: woNumber.get(c.workOrderId) ?? c.workOrderId,
        title: "Preventive maintenance checklist",
        detail: joinDetail([
          c.observations,
          c.correctiveActionRequired ? `corrective action raised: ${c.actionDescription ?? "see record"}` : null,
          c.sparePartsNeeded && `spares: ${c.sparePartsNeeded}`,
          c.nextPMDate && `next PM ${day(c.nextPMDate)}`,
          `safety: ${[
            c.ptwIssued && "PTW",
            c.lotoApplied && "LOTO",
            c.ppeWorn && "PPE",
            c.areaSafe && "area safe",
          ].filter(Boolean).join("/") || "not recorded"}`,
        ]),
        performedBy: c.technicianName ?? "-",
        state: joinDetail([
          c.pmCompleted ? "completed" : "not completed",
          signatures,
          chainFor("PM_CHECKLIST", c.id),
        ]),
        href: `/work-orders/${c.workOrderId}/pm-checklist`,
      });
    }

    // 3. Corrective records, fault, root cause, downtime, close-out.
    const cmsInRange = cms.filter((c) => inRange(c.reportedDate) || inRange(c.closeOutDate));
    for (const c of cmsInRange) {
      events.push({
        date: day(c.reportedDate || c.createdAt),
        category: "Corrective",
        reference: c.cmrfNumber,
        title: c.observedFault || c.faultDescription || "Breakdown reported",
        detail: joinDetail([
          c.faultType && `${c.faultType.toLowerCase()} fault`,
          c.faultDescription && c.observedFault ? c.faultDescription : null,
          c.verifiedRootCause
            ? `root cause: ${c.verifiedRootCause}`
            : c.rootCauseCategory
              ? `root cause category: ${c.rootCauseCategory.toLowerCase()}`
              : "root cause not recorded",
          c.rcaTool && `RCA via ${c.rcaTool.replace(/_/g, " ").toLowerCase()}`,
          c.partsReplaced && `parts: ${c.partsReplaced}`,
          c.totalDowntimeHours != null
            ? `${c.totalDowntimeHours} h downtime`
            : "downtime window not recorded",
          c.closeOutDate ? `closed ${day(c.closeOutDate)}` : "not closed out",
        ]),
        performedBy: c.technicianName || c.reportedByName || "-",
        state: joinDetail([c.status.replace(/_/g, " "), chainFor("CORRECTIVE", c.id)]),
        href: `/corrective/${c.id}`,
      });
    }

    // 4. Non-conformities raised against this machine.
    const ncsInRange = ncs.filter((n) => inRange(n.detectedDate) || inRange(n.closeOutDate));
    for (const n of ncsInRange) {
      events.push({
        date: day(n.detectedDate || n.createdAt),
        category: "Non-conformity",
        reference: n.ncNumber,
        title: `${n.type.replace(/_/g, " ")}, ${n.severity.toLowerCase()} severity`,
        detail: joinDetail([
          n.description,
          n.rootCause && `root cause: ${n.rootCause}`,
          n.correctiveAction && `action: ${n.correctiveAction}`,
          n.closeOutDate ? `closed ${day(n.closeOutDate)}` : n.targetDate ? `target ${day(n.targetDate)}` : null,
        ]),
        performedBy: n.detectedBy ?? "-",
        state: joinDetail([
          n.status.replace(/_/g, " "),
          chainFor(n.type === "SAFETY_INCIDENT" ? "SAFETY_INCIDENT" : "NON_CONFORMITY", n.id),
        ]),
        href: "/audit/non-conformity",
      });
    }

    // 5. Calibration events for instruments attached to this machine.
    const instrumentName = new Map(instruments.map((i) => [i.id, i.instrumentName]));
    const calInRange = calEvents.filter((c) => inRange(c.calibrationDate));
    for (const c of calInRange) {
      events.push({
        date: day(c.calibrationDate),
        category: "Calibration",
        reference: c.certificateNumber || instrumentName.get(c.instrumentId) || "-",
        title: `Calibration, ${instrumentName.get(c.instrumentId) ?? "instrument"}`,
        detail: joinDetail([
          c.asFound && `as found ${c.asFound.replace(/_/g, " ").toLowerCase()}`,
          c.asLeft && `as left ${c.asLeft.replace(/_/g, " ").toLowerCase()}`,
          c.traceableTo && `traceable to ${c.traceableTo}`,
          c.labName && `lab ${c.labName}${c.labAccreditationNo ? ` (${c.labAccreditationNo})` : ""}`,
          c.nextCalibrationDate && `next due ${day(c.nextCalibrationDate)}`,
          c.notes,
        ]),
        performedBy: c.calibratedBy ?? "-",
        state: c.verdict,
        href: "/calibration",
      });
    }

    // 6. Documents issued against the machine in the window.
    const docsInRange = docs.filter((d) => inRange(d.issuedDate || d.createdAt));
    for (const d of docsInRange) {
      events.push({
        date: day(d.issuedDate || d.createdAt),
        category: "Document",
        reference: d.revision ? `Rev ${d.revision}` : d.docType.replace(/_/g, " "),
        title: d.title,
        detail: joinDetail([
          d.docType.replace(/_/g, " ").toLowerCase(),
          d.fileName,
          d.expiryDate && `expires ${day(d.expiryDate)}`,
          d.notes,
        ]),
        performedBy: d.uploadedBy ?? "-",
        state: d.status,
        href: `/equipment/${(asset.assetId || "").replace(/\//g, "-")}`,
      });
    }

    // 7. Machine-log entries, accidents, transfers, diagnoses, status changes,
    //    notes. buildTimeline() prefers its AUTO log entry over the source row it
    //    was written from; a dossier wants the opposite (the source record carries
    //    root cause, downtime and sign-off), so an entry pointing at a record
    //    already listed above is dropped rather than the record.
    const emitted = new Set([
      ...wosInRange.map((w) => `work_order:${w.id}`),
      ...cmsInRange.map((c) => `corrective_maintenance:${c.id}`),
    ]);
    for (const entry of timeline) {
      if (entry.source === "DERIVED") continue;
      if (!inRange(entry.occurredAt)) continue;
      if (entry.refId && emitted.has(`${entry.refType}:${entry.refId}`)) continue;
      const refLabel =
        (entry.refType === "work_order" && entry.refId && woNumber.get(entry.refId)) ||
        (entry.refType === "corrective_maintenance" && entry.refId && cmNumber.get(entry.refId)) ||
        ", ";
      events.push({
        date: day(entry.occurredAt),
        category: titleFor(entry.category),
        reference: refLabel,
        title: entry.title,
        detail: entry.detail ?? "",
        performedBy: entry.performedByName ?? "-",
        state: entry.source === "MANUAL" ? "Logged manually" : "Recorded automatically",
        href: entry.href,
      });
    }

    events.sort((a, b) => (a.date === b.date ? a.category.localeCompare(b.category) : a.date < b.date ? -1 : 1));

    // ── Totals ────────────────────────────────────────────────────────────────
    const breakdowns = cms.filter((c) => inRange(c.reportedDate));
    const downtimeHours = breakdowns.reduce((sum, c) => sum + (c.totalDowntimeHours ?? 0), 0);
    const plannedHours = plannedHoursInRange(from, to, workSettings);
    const availability = plannedHours > 0 ? Math.max(0, (plannedHours - downtimeHours) / plannedHours) : null;
    const withoutDowntimeWindow = breakdowns.filter((c) => c.totalDowntimeHours == null).length;

    return NextResponse.json({
      generatedAt: isoSeconds(),
      range: { from, to },
      equipment: {
        assetId: asset.assetId,
        name: asset.name,
        category: asset.category,
        subCategory: asset.subCategory,
        location: asset.location,
        bay: asset.bay,
        oem: asset.oem,
        model: asset.model,
        serialNumber: asset.serialNumber,
        commissioningDate: asset.commissioningDate,
        warrantyExpiry: asset.warrantyExpiry,
        criticality: asset.criticality,
        status: asset.status,
        maintenanceFrequency: asset.maintenanceFrequency,
        requiresCalibration: asset.requiresCalibration,
      },
      totals: {
        events: events.length,
        workOrders: wosInRange.length,
        pmWorkOrders: wosInRange.filter((w) => w.type === "PREVENTIVE").length,
        pmChecklists: checklistsInRange.length,
        pmChecklistsCompleted: checklistsInRange.filter((c) => c.pmCompleted).length,
        breakdowns: breakdowns.length,
        breakdownsOpen: breakdowns.filter((c) => c.status !== "CLOSED").length,
        downtimeHours: +downtimeHours.toFixed(1),
        // Availability is honest only when every breakdown carries a window.
        downtimeUnrecorded: withoutDowntimeWindow,
        plannedHours: +plannedHours.toFixed(1),
        availability,
        nonConformities: ncsInRange.length,
        nonConformitiesOpen: ncsInRange.filter((n) => n.status !== "CLOSED").length,
        calibrations: calInRange.length,
        calibrationFailures: calInRange.filter((c) => c.verdict !== "PASS").length,
        documents: docsInRange.length,
      },
      events,
    });
  } catch (error) {
    console.error("Failed to build asset history dossier:", error);
    return NextResponse.json({ error: "Failed to build asset history" }, { status: 500 });
  }
}

function titleFor(category: string): string {
  const map: Record<string, string> = {
    PM: "Preventive",
    CM: "Corrective",
    INSPECTION: "Inspection",
    ACCIDENT: "Incident",
    TRANSFER: "Transfer",
    DIAGNOSIS: "Diagnosis",
    STATUS: "Status change",
    NOTE: "Note",
    CALIBRATION: "Calibration",
    DOCUMENT: "Document",
    OTHER: "Machine log",
  };
  return map[category] ?? "Machine log";
}
