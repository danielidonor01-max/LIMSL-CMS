// src/lib/db/seed-oem-calibration.ts
// Phase 6 seed: OEM registry (vendors, warranty, spare-part lead times) and
// the calibration register for measuring instruments. Idempotent.

import { db } from "./index";
import {
  equipment,
  oemRegistry,
  oemInterventions,
  calibrationRecords,
} from "./schema";
import { nanoid } from "nanoid";

const TODAY = new Date();
const daysFromNow = (d: number) =>
  new Date(TODAY.getTime() + d * 864e5).toISOString().slice(0, 10);

export async function seedOemCalibration() {
  console.log("🏭 Seeding OEM registry & calibration (Phase 6)...");

  const eqList = await db.select().from(equipment);
  const find = (needle: string) =>
    eqList.find((e) => e.name.toLowerCase().includes(needle.toLowerCase()));

  await db.delete(oemInterventions);
  await db.delete(oemRegistry);
  await db.delete(calibrationRecords);

  // ── OEM registry ───────────────────────────────────────────────────────
  const oemDefs: {
    needle: string;
    vendorName: string;
    contactPerson: string;
    phone: string;
    email: string;
    country: string;
    warrantyEndOffsetDays: number;
    warrantyScope: string;
    responseHrs: number;
    leadDays: number;
  }[] = [
    { needle: "stako", vendorName: "VILMAR (Stako CNC specialist)", contactPerson: "Andrei Popescu", phone: "+40 21 555 0110", email: "service@vilmar.ro", country: "Romania", warrantyEndOffsetDays: -120, warrantyScope: "Control system, drives, spindle", responseHrs: 72, leadDays: 45 },
    { needle: "vertical lathe", vendorName: "Metal Gennari S.r.l.", contactPerson: "Luca Bianchi", phone: "+39 030 555 220", email: "aftersales@metalgennari.it", country: "Italy", warrantyEndOffsetDays: 210, warrantyScope: "Full machine — 24 months", responseHrs: 96, leadDays: 60 },
    { needle: "sertom plate rolling", vendorName: "Sertom S.p.A.", contactPerson: "Marco Rossi", phone: "+39 030 999 100", email: "service@sertom.com", country: "Italy", warrantyEndOffsetDays: 60, warrantyScope: "Hydraulics & rollers", responseHrs: 96, leadDays: 55 },
    { needle: "esab column boom", vendorName: "ESAB Middle East", contactPerson: "Ahmed Al-Rashid", phone: "+971 4 555 700", email: "support@esab.ae", country: "UAE", warrantyEndOffsetDays: -300, warrantyScope: "Wire feed & power source", responseHrs: 48, leadDays: 21 },
    { needle: "kone 12t overhead crane #1", vendorName: "Konecranes Nigeria", contactPerson: "Emeka Obi", phone: "+234 1 271 5500", email: "service.ng@konecranes.com", country: "Nigeria", warrantyEndOffsetDays: 400, warrantyScope: "Hoist, brakes, controls — AMC", responseHrs: 24, leadDays: 14 },
  ];

  type OemRow = typeof oemRegistry.$inferInsert;
  const oemRows: OemRow[] = [];
  const oemByNeedle: Record<string, string> = {};

  for (const d of oemDefs) {
    const eq = find(d.needle);
    if (!eq) continue;
    const id = nanoid();
    oemByNeedle[d.needle] = id;
    const warrantyEnd = daysFromNow(d.warrantyEndOffsetDays);
    oemRows.push({
      id,
      equipmentId: eq.id,
      vendorName: d.vendorName,
      contactPerson: d.contactPerson,
      phone: d.phone,
      email: d.email,
      country: d.country,
      warrantyStart: daysFromNow(d.warrantyEndOffsetDays - 730),
      warrantyEnd,
      warrantyScope: d.warrantyScope,
      warrantyActive: d.warrantyEndOffsetDays > 0,
      avgResponseTimeHrs: d.responseHrs,
      avgSpareLeadTimeDays: d.leadDays,
      notes: eq.assetId,
    });
  }
  if (oemRows.length) await db.insert(oemRegistry).values(oemRows);

  // One OEM intervention (Stako active case)
  const stakoEq = find("stako");
  if (stakoEq && oemByNeedle["stako"]) {
    await db.insert(oemInterventions).values({
      id: nanoid(),
      oemId: oemByNeedle["stako"],
      equipmentId: stakoEq.id,
      interventionDate: daysFromNow(-3),
      problemDescription: "No motion on X axis — suspected drive/encoder fault",
      warrantyStatus: "OUT",
      oemNotified: true,
      responseTimeHrs: 72,
      resolutionSummary: "Awaiting VILMAR remote diagnostics session",
      closed: false,
    });
  }

  // ── Calibration register ─────────────────────────────────────────────────
  type CalRow = typeof calibrationRecords.$inferInsert;
  const calDefs: { needle: string; interval: number; lastOffset: number; make: string; model: string }[] = [
    { needle: "earth resistance tester", interval: 365, lastOffset: -200, make: "HT", model: "HT20302" },
    { needle: "clamp meter", interval: 365, lastOffset: -340, make: "Fluke", model: "376 FC" },
    { needle: "insulation tester", interval: 365, lastOffset: -400, make: "Megger", model: "MIT230" },
    { needle: "multimeter", interval: 365, lastOffset: -90, make: "Fluke", model: "117" },
  ];

  const calRows: CalRow[] = [];
  for (const c of calDefs) {
    const eq = find(c.needle);
    const last = daysFromNow(c.lastOffset);
    const next = daysFromNow(c.lastOffset + c.interval);
    const nextDate = new Date(next);
    const status =
      nextDate < TODAY
        ? "OVERDUE"
        : nextDate.getTime() - TODAY.getTime() < 30 * 864e5
          ? "DUE_SOON"
          : "CURRENT";
    calRows.push({
      id: nanoid(),
      instrumentName: eq?.name ?? c.needle,
      equipmentId: eq?.id ?? null,
      serialNumber: eq?.serialNumber ?? null,
      make: c.make,
      model: c.model,
      lastCalibrationDate: last,
      nextCalibrationDate: next,
      calibrationInterval: c.interval,
      calibratedBy: "External accredited lab",
      certificateNumber: `CAL-${c.model.replace(/\s/g, "")}-2026`,
      status,
    });
  }
  if (calRows.length) await db.insert(calibrationRecords).values(calRows);

  console.log(`✅ ${oemRows.length} OEM vendors, 1 intervention, ${calRows.length} calibration records`);
  console.log("🎉 OEM & calibration seed complete!");
}

seedOemCalibration()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ OEM/calibration seed failed:", e);
    process.exit(1);
  });
