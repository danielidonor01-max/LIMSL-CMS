// src/lib/db/seed-documents.ts
// Phase: per-machine document register.
// Rules (derived from the LIMS maintenance log conventions):
//   • Every machine requires: Electrical Schematic, Operational Manual, SOP.
//   • Measuring instruments & heavy CNC require CALIBRATION reports.
//   • Cranes / lifting equipment require PRE-MOBILIZATION (premob) reports.
// Some documents are seeded as REQUIRED (missing) to surface real gaps.

import { db } from "./index";
import { equipment, equipmentDocuments } from "./schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);

export async function seedDocuments() {
  console.log("📄 Seeding per-machine document register...");
  const eqList = await db.select().from(equipment);
  await db.delete(equipmentDocuments);

  type Row = typeof equipmentDocuments.$inferInsert;
  const rows: Row[] = [];
  const add = (r: Omit<Row, "id">) => rows.push({ id: nanoid(), ...r });

  let i = 0;
  for (const eq of eqList) {
    const requiresCalibration = eq.category === "MEASURING" || eq.category === "CNC_HEAVY";
    const requiresPremob = eq.category === "CRANE";

    // Persist the flags on the equipment record
    await db
      .update(equipment)
      .set({ requiresCalibration, requiresPremob })
      .where(eq2(eq.id));

    // Core documents (schematic not meaningful for hand instruments)
    if (eq.category !== "MEASURING") {
      add({
        equipmentId: eq.id,
        docType: "ELECTRICAL_SCHEMATIC",
        title: `Electrical Schematic — ${eq.name}`,
        status: i % 4 === 0 ? "REQUIRED" : "AVAILABLE",
        revision: "Rev 1",
        fileUrl: i % 4 === 0 ? null : `#/docs/${eq.assetId}/schematic.pdf`,
      });
    }
    add({
      equipmentId: eq.id,
      docType: "OPERATIONAL_MANUAL",
      title: `Operational Manual — ${eq.name}`,
      status: "AVAILABLE",
      fileUrl: `#/docs/${eq.assetId}/manual.pdf`,
      notes: eq.oem ? `OEM: ${eq.oem}` : undefined,
    });
    add({
      equipmentId: eq.id,
      docType: "SOP",
      title: `Standard Operating Procedure — ${eq.name}`,
      status: i % 3 === 0 ? "REQUIRED" : "AVAILABLE",
      revision: "Rev 2",
      fileUrl: i % 3 === 0 ? null : `#/docs/${eq.assetId}/sop.pdf`,
    });

    if (requiresCalibration) {
      const lastCal = iso(-200 - (i % 5) * 20);
      const nextCal = iso(165 - (i % 5) * 20);
      const expired = new Date(nextCal) < new Date();
      add({
        equipmentId: eq.id,
        docType: "CALIBRATION_REPORT",
        title: `Calibration Certificate — ${eq.name}`,
        status: expired ? "EXPIRED" : "AVAILABLE",
        issuedDate: lastCal,
        expiryDate: nextCal,
        fileUrl: `#/docs/${eq.assetId}/calibration.pdf`,
        uploadedBy: "External accredited lab",
      });
    }

    if (requiresPremob) {
      const issued = iso(-120 - (i % 3) * 15);
      const expiry = iso(245 - (i % 3) * 15);
      add({
        equipmentId: eq.id,
        docType: "PREMOB_REPORT",
        title: `Pre-Mobilization / Load Test Report — ${eq.name}`,
        status: "AVAILABLE",
        issuedDate: issued,
        expiryDate: expiry,
        revision: "Annual",
        fileUrl: `#/docs/${eq.assetId}/premob.pdf`,
        uploadedBy: "Lifting inspection body",
      });
    }
    i++;
  }

  await db.insert(equipmentDocuments).values(rows);

  const byType: Record<string, number> = {};
  rows.forEach((r) => (byType[r.docType] = (byType[r.docType] ?? 0) + 1));
  console.log(`✅ ${rows.length} documents:`, JSON.stringify(byType));
  console.log(
    `✅ flags — calibration: ${eqList.filter((e) => e.category === "MEASURING" || e.category === "CNC_HEAVY").length}, premob: ${eqList.filter((e) => e.category === "CRANE").length}`,
  );
  console.log("🎉 Document register seed complete!");
}

// local helper to avoid shadowing the `eq` loop variable name clash
function eq2(id: string) {
  return eq(equipment.id, id);
}

seedDocuments()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Document seed failed:", e);
    process.exit(1);
  });
