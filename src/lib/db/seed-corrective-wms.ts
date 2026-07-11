// src/lib/db/seed-corrective-wms.ts
// Seeds a representative corrective-maintenance case (the documented Stako
// LEE/PE/10026 "no motion X axis" breakdown) and two Work Method Statements
// so the Phase 3/4 flows have data to preview. Idempotent.

import { db } from "./index";
import { equipment, correctiveMaintenance, wmsDocuments } from "./schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

export async function seedCorrectiveWms() {
  console.log("🛠️  Seeding corrective case + WMS (Phase 3/4)...");

  const eqList = await db.select().from(equipment);
  const find = (needle: string) =>
    eqList.find((e) => e.name.toLowerCase().includes(needle.toLowerCase()));

  await db.delete(correctiveMaintenance);
  await db.delete(wmsDocuments);

  const stako = find("stako");
  const sertom = find("sertom plate rolling");

  if (stako) {
    await db.insert(correctiveMaintenance).values({
      id: nanoid(),
      cmrfNumber: "CMRF-2026-0001",
      breakdownId: "BD-LEE-PE-10026",
      equipmentId: stako.id,
      reportedById: null,
      reportedByName: "Godspower Michael",
      reportedDate: iso(-4),
      faultType: "CONTROL",
      urgency: "CRITICAL",
      faultDescription:
        "CNC reports no motion on the X axis. Axis fails to home on startup; job halted.",
      operatingStatusAtFailure: "RUNNING",
      observedFault: "No motion X axis",
      errorCodes: "ALM-401 (X servo)",
      reportedTime: iso(-4),
      productionImpact: "Machining of pressure-vessel nozzles halted",
      status: "OPEN",
    });
    // Reflect the open breakdown on the equipment status
    await db
      .update(equipment)
      .set({ status: "BROKEN_DOWN" })
      .where(eq(equipment.id, stako.id));
    console.log("✅ Corrective case CMRF-2026-0001 (Stako, no motion X axis)");
  }

  const proc = (steps: string[]) => JSON.stringify(steps.map((s, i) => ({ step: String.fromCharCode(65 + i), description: s })));

  await db.insert(wmsDocuments).values([
    {
      id: nanoid(),
      wmsNumber: "WMS-2026-0001",
      title: "Roller alignment & hydraulic service — Sertom Plate Rolling Machine",
      revision: 1,
      machinesScope: JSON.stringify(["Sertom Plate Rolling Machine"]),
      equipmentIds: JSON.stringify(sertom ? [sertom.id] : []),
      purpose: "Restore rolling accuracy and service the hydraulic system.",
      scope: "Applies to the Sertom plate rolling machine in Bay 2.",
      methodology: "Isolate, inspect, align rollers, replace hydraulic filters, function test.",
      workProcedureSteps: proc([
        "Isolate machine and apply LOTO",
        "Inspect rollers and bearings",
        "Align top/bottom rollers to spec",
        "Replace hydraulic filters and top up fluid",
        "Remove LOTO and function test at low load",
      ]),
      safetyRequirements: "PTW, LOTO, mechanical PPE, pinch-point awareness.",
      status: "APPROVED",
      preparedByName: "Daniel Idonor",
      preparedDate: iso(-10),
      reviewedByName: "Kingsley Iworah",
      reviewedDate: iso(-8),
      approvedByName: "Osaghale Ikpea",
      approvedDate: iso(-7),
    },
    {
      id: nanoid(),
      wmsNumber: "WMS-2026-0002",
      title: "X-axis servo diagnosis & replacement — Stako CNC Machine",
      revision: 0,
      machinesScope: JSON.stringify(["Stako CNC Machine"]),
      equipmentIds: JSON.stringify(stako ? [stako.id] : []),
      purpose: "Diagnose and rectify the X-axis no-motion fault.",
      scope: "Applies to the Stako CNC machine pending OEM (VILMAR) support.",
      methodology: "Isolate, verify servo/encoder, swap drive, commission axis.",
      workProcedureSteps: proc([
        "Isolate machine and apply LOTO",
        "Verify X servo drive and encoder feedback",
        "Coordinate with VILMAR for drive parameters",
        "Replace faulty drive/encoder",
        "Home and calibrate X axis",
      ]),
      safetyRequirements: "PTW, LOTO, electrical PPE, arc-flash boundary.",
      status: "DRAFT",
      preparedByName: "Marcel Imadojiemu",
      preparedDate: iso(-2),
    },
  ]);
  console.log("✅ 2 WMS documents (1 approved, 1 draft)");
  console.log("🎉 Corrective + WMS seed complete!");
}

seedCorrectiveWms()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Corrective/WMS seed failed:", e);
    process.exit(1);
  });
