// src/app/api/search/route.ts
// Global search across every module that holds records a person would look for
// by name or number.
//
// It previously covered four: equipment, work orders, corrective and WMS. Every
// module added afterwards silently did not join, so by the end of Phase 6 the
// search bar could not find permits, spares, calibration instruments, emergency
// equipment, contractors or non-conformities — the majority of the app. That is
// the failure mode this file's shape now guards against: the searchable set is
// a declared list, and a test asserts it covers the modules that exist.
//
// Filtering happens IN SQL (ILIKE + LIMIT, selected columns only) — this runs on
// every keystroke of the typeahead, so it must never load whole tables into JS.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipment,
  workOrders,
  correctiveMaintenance,
  wmsDocuments,
  permits,
  spareParts,
  calibrationRecords,
  emergencyEquipment,
  contractors,
  nonConformities,
  trainingRecords,
} from "@/lib/db/schema";
import { ilike, or } from "drizzle-orm";

type Result = { type: string; label: string; sub: string; href: string };

// The modules the search is expected to reach. Named here so the coverage test
// can compare it against the app's routes rather than trusting a comment.
export const SEARCHABLE_TYPES = [
  "Equipment",
  "Work Order",
  "Corrective",
  "WMS",
  "Permit",
  "Spare",
  "Instrument",
  "Emergency",
  "Contractor",
  "Non-conformity",
  "Training",
] as const;

const PER_ENTITY = 4;

export async function GET(request: Request) {
  try {
    const q = (new URL(request.url).searchParams.get("q") || "").trim();
    if (q.length < 2) return NextResponse.json([]);
    // Escape LIKE wildcards so a literal "%" in the query can't blow up the scan.
    const pat = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

    const [eqRows, woRows, cmRows, wmsRows, ptwRows, spRows, calRows, emgRows, conRows, ncRows, trnRows] =
      await Promise.all([
        db
          .select({ name: equipment.name, assetId: equipment.assetId, location: equipment.location })
          .from(equipment)
          .where(or(ilike(equipment.name, pat), ilike(equipment.assetId, pat), ilike(equipment.oem, pat)))
          .limit(PER_ENTITY),
        db
          .select({ id: workOrders.id, workOrderNumber: workOrders.workOrderNumber, title: workOrders.title })
          .from(workOrders)
          .where(or(ilike(workOrders.workOrderNumber, pat), ilike(workOrders.title, pat)))
          .limit(PER_ENTITY),
        db
          .select({
            id: correctiveMaintenance.id,
            cmrfNumber: correctiveMaintenance.cmrfNumber,
            observedFault: correctiveMaintenance.observedFault,
            faultType: correctiveMaintenance.faultType,
          })
          .from(correctiveMaintenance)
          .where(
            or(
              ilike(correctiveMaintenance.cmrfNumber, pat),
              ilike(correctiveMaintenance.observedFault, pat),
              ilike(correctiveMaintenance.faultDescription, pat),
            ),
          )
          .limit(PER_ENTITY),
        db
          .select({ id: wmsDocuments.id, wmsNumber: wmsDocuments.wmsNumber, title: wmsDocuments.title })
          .from(wmsDocuments)
          .where(or(ilike(wmsDocuments.wmsNumber, pat), ilike(wmsDocuments.title, pat)))
          .limit(PER_ENTITY),
        db
          .select({
            id: permits.id,
            permitNumber: permits.permitNumber,
            workDescription: permits.workDescription,
            status: permits.status,
          })
          .from(permits)
          .where(or(ilike(permits.permitNumber, pat), ilike(permits.workDescription, pat)))
          .limit(PER_ENTITY),
        db
          .select({
            id: spareParts.id,
            partNumber: spareParts.partNumber,
            name: spareParts.name,
            binLocation: spareParts.binLocation,
          })
          .from(spareParts)
          .where(or(ilike(spareParts.partNumber, pat), ilike(spareParts.name, pat)))
          .limit(PER_ENTITY),
        db
          .select({
            id: calibrationRecords.id,
            instrumentName: calibrationRecords.instrumentName,
            serialNumber: calibrationRecords.serialNumber,
          })
          .from(calibrationRecords)
          .where(or(ilike(calibrationRecords.instrumentName, pat), ilike(calibrationRecords.serialNumber, pat)))
          .limit(PER_ENTITY),
        db
          .select({
            id: emergencyEquipment.id,
            tagNumber: emergencyEquipment.tagNumber,
            type: emergencyEquipment.type,
            location: emergencyEquipment.location,
          })
          .from(emergencyEquipment)
          .where(or(ilike(emergencyEquipment.tagNumber, pat), ilike(emergencyEquipment.location, pat)))
          .limit(PER_ENTITY),
        db
          .select({
            id: contractors.id,
            companyName: contractors.companyName,
            tradeSpecialty: contractors.tradeSpecialty,
          })
          .from(contractors)
          .where(or(ilike(contractors.companyName, pat), ilike(contractors.tradeSpecialty, pat)))
          .limit(PER_ENTITY),
        db
          .select({ id: nonConformities.id, ncNumber: nonConformities.ncNumber, description: nonConformities.description })
          .from(nonConformities)
          .where(or(ilike(nonConformities.ncNumber, pat), ilike(nonConformities.description, pat)))
          .limit(PER_ENTITY),
        db
          .select({
            id: trainingRecords.id,
            employeeName: trainingRecords.employeeName,
            trainingTitle: trainingRecords.trainingTitle,
          })
          .from(trainingRecords)
          .where(or(ilike(trainingRecords.employeeName, pat), ilike(trainingRecords.trainingTitle, pat)))
          .limit(PER_ENTITY),
      ]);

    const results: Result[] = [
      ...eqRows.map((e) => ({
        type: "Equipment",
        label: e.name,
        sub: `${e.assetId} · ${e.location ?? ""}`,
        href: `/equipment/${(e.assetId || "").replace(/\//g, "-")}`,
      })),
      ...woRows.map((w) => ({
        type: "Work Order",
        label: w.workOrderNumber,
        sub: w.title,
        href: `/work-orders/${w.id}`,
      })),
      ...cmRows.map((c) => ({
        type: "Corrective",
        label: c.cmrfNumber,
        sub: c.observedFault || c.faultType || "",
        href: `/corrective/${c.id}`,
      })),
      ...wmsRows.map((w) => ({
        type: "WMS",
        label: w.wmsNumber,
        sub: w.title,
        href: `/wms/${w.id}`,
      })),
      ...ptwRows.map((p) => ({
        type: "Permit",
        label: p.permitNumber,
        sub: `${p.status} · ${p.workDescription ?? ""}`,
        href: `/permits/${p.id}`,
      })),
      ...spRows.map((s) => ({
        type: "Spare",
        label: s.name,
        sub: `${s.partNumber}${s.binLocation ? ` · bin ${s.binLocation}` : ""}`,
        href: `/spares?q=${encodeURIComponent(s.partNumber)}`,
      })),
      ...calRows.map((c) => ({
        type: "Instrument",
        label: c.instrumentName,
        sub: c.serialNumber ?? "",
        href: `/calibration`,
      })),
      ...emgRows.map((e) => ({
        type: "Emergency",
        label: e.tagNumber,
        sub: `${e.type} · ${e.location}`,
        href: `/emergency?q=${encodeURIComponent(e.tagNumber)}`,
      })),
      ...conRows.map((c) => ({
        type: "Contractor",
        label: c.companyName,
        sub: c.tradeSpecialty ?? "",
        href: `/contractors?q=${encodeURIComponent(c.companyName)}`,
      })),
      ...ncRows.map((n) => ({
        type: "Non-conformity",
        label: n.ncNumber,
        sub: n.description,
        href: `/audit/non-conformity`,
      })),
      ...trnRows.map((t) => ({
        type: "Training",
        label: t.employeeName ?? "—",
        sub: t.trainingTitle ?? "",
        href: `/training`,
      })),
    ];

    return NextResponse.json(results.slice(0, 24));
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
