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

  // ── Historical CLOSED corrective cases with full RCA — the knowledge base the
  //    diagnostic engine learns from. ─────────────────────────────────────────
  const ca = (actions: { action: string; responsible: string; status: string }[]) =>
    JSON.stringify(actions);

  type HistCase = {
    needle: string;
    seq: number;
    daysAgo: number;
    faultType: string;
    observedFault: string;
    errorCodes?: string;
    faultDescription: string;
    rcaTool: string;
    rootCauseCategory: string;
    verifiedRootCause: string;
    correctiveActions: string;
    partsReplaced?: string;
    preventiveActions?: string;
  };

  const history: HistCase[] = [
    {
      needle: "stako", seq: 9001, daysAgo: 130, faultType: "CONTROL",
      observedFault: "No motion X axis", errorCodes: "E-041",
      faultDescription: "X axis failed to home; drive flagged E-041 overcurrent on start.",
      rcaTool: "FIVE_WHYS", rootCauseCategory: "MECHANICAL",
      verifiedRootCause: "Limit switch LS-X1 contacts oxidised and intermittently open, tripping the X servo drive.",
      correctiveActions: ca([{ action: "Cleaned & replaced LS-X1 contacts, reseated wires 104/105", responsible: "Marcel Imadojiemu", status: "COMPLETED" }]),
      partsReplaced: "Limit switch Schneider XCKJ161",
      preventiveActions: "Added LS-X1 contact inspection to quarterly PM.",
    },
    {
      needle: "stako", seq: 9002, daysAgo: 240, faultType: "ELECTRICAL",
      observedFault: "X axis drive overcurrent", errorCodes: "E-041",
      faultDescription: "Repeated X axis overcurrent under load; drive tripped mid-cut.",
      rcaTool: "FISHBONE", rootCauseCategory: "MECHANICAL",
      verifiedRootCause: "Worn X-axis ball-screw bearing increased friction, drawing excess servo current.",
      correctiveActions: ca([{ action: "Replaced ball-screw bearing and retuned servo drive SD-X1", responsible: "Godspower Michael", status: "COMPLETED" }]),
      partsReplaced: "Ball-screw support bearing",
    },
    {
      needle: "kone 12t overhead crane #1", seq: 9003, daysAgo: 95, faultType: "ELECTRICAL",
      observedFault: "Hoist will not lower",
      faultDescription: "Crane hoist raises but will not lower; contactor not energising.",
      rcaTool: "FIVE_WHYS", rootCauseCategory: "ELECTRICAL",
      verifiedRootCause: "Lower-limit switch stuck open, inhibiting the lower contactor.",
      correctiveActions: ca([{ action: "Replaced lower-limit switch and tested lower interlock", responsible: "Marcel Imadojiemu", status: "COMPLETED" }]),
      partsReplaced: "Lower limit switch",
    },
    {
      needle: "esab column boom", seq: 9004, daysAgo: 160, faultType: "MECHANICAL",
      observedFault: "Wire feed intermittent",
      faultDescription: "SAW wire feed stutters, causing weld defects.",
      rcaTool: "FIVE_WHYS", rootCauseCategory: "MECHANICAL",
      verifiedRootCause: "Worn drive rolls and a blocked wire liner interrupted feed.",
      correctiveActions: ca([{ action: "Replaced drive rolls and wire liner; set roll tension", responsible: "Marcel Imadojiemu", status: "COMPLETED" }]),
      partsReplaced: "Drive rolls, wire liner",
    },
    {
      needle: "sertom plate rolling", seq: 9005, daysAgo: 210, faultType: "HYDRAULIC",
      observedFault: "Rollers lose pressure",
      faultDescription: "Top roller will not hold set pressure; plate springs back.",
      rcaTool: "FISHBONE", rootCauseCategory: "MECHANICAL",
      verifiedRootCause: "Hydraulic pressure-relief valve stuck partially open due to contaminated oil.",
      correctiveActions: ca([{ action: "Overhauled relief valve, replaced seals, flushed hydraulic oil", responsible: "Godspower Michael", status: "COMPLETED" }]),
      partsReplaced: "Relief valve seal kit; hydraulic oil",
    },
    {
      needle: "vertical lathe", seq: 9006, daysAgo: 300, faultType: "MECHANICAL",
      observedFault: "Spindle overheating",
      faultDescription: "Vertical lathe spindle overheats after ~30 min of cutting.",
      rcaTool: "FIVE_WHYS", rootCauseCategory: "MECHANICAL",
      verifiedRootCause: "Degraded spindle bearing and low lubricant flow caused overheating.",
      correctiveActions: ca([{ action: "Replaced spindle bearing and restored lubrication flow", responsible: "Godspower Michael", status: "COMPLETED" }]),
      partsReplaced: "Spindle bearing",
    },
  ];

  const histRows = history
    .map((h) => {
      const machine = h.needle === "stako" ? stako : find(h.needle);
      if (!machine) return null;
      return {
        id: nanoid(),
        cmrfNumber: `CMRF-2025-${String(h.seq).padStart(4, "0")}`,
        breakdownId: `BD-${h.seq}`,
        equipmentId: machine.id,
        reportedByName: "Maintenance Team",
        reportedDate: iso(-h.daysAgo),
        faultType: h.faultType,
        urgency: "HIGH",
        faultDescription: h.faultDescription,
        observedFault: h.observedFault,
        errorCodes: h.errorCodes ?? null,
        operatingStatusAtFailure: "RUNNING",
        rcaTool: h.rcaTool,
        rootCauseCategory: h.rootCauseCategory,
        verifiedRootCause: h.verifiedRootCause,
        correctiveActions: h.correctiveActions,
        preventiveActions: h.preventiveActions ?? null,
        partsReplaced: h.partsReplaced ?? null,
        repairStatus: "FULLY_RESTORED",
        closeOutDate: iso(-h.daysAgo + 2),
        status: "CLOSED",
      };
    })
    .filter(Boolean) as (typeof correctiveMaintenance.$inferInsert)[];

  if (histRows.length) await db.insert(correctiveMaintenance).values(histRows);
  console.log(`✅ ${histRows.length} historical closed RCA cases (engine knowledge base)`);

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
