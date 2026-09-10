// src/lib/db/seed-facility-assets.ts
// Loads LIMSL's 19 office split AC units and its 4 externally calibrated
// instruments into the asset register.
//
// Upserts, never deletes. The other seeds in this folder clear the tables they
// own before writing, which is right for a demo database and wrong for this
// one: these are real assets going into a register that already holds real
// machines. Re-running corrects the rows it owns and touches nothing else.
//
// It also leaves `status` and `criticality` alone on an existing row. A unit
// marked BROKEN_DOWN by a technician must not be quietly reset to OPERATIONAL
// by someone re-running an import.
//
//   DATABASE_URL=postgresql://... npx tsx src/lib/db/seed-facility-assets.ts

import { db } from "./index";
import { equipment, calibrationRecords } from "./schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { AC_UNITS, CALIBRATED_INSTRUMENTS, CONFLICTS } from "../facility-assets";
import { nextAssetId } from "../asset-id";
import { statusForNextDate } from "../calibration";

const now = () => new Date().toISOString();

export async function seedFacilityAssets() {
  console.log("❄️  Seeding office AC units and calibrated instruments...");

  const existing = await db.select().from(equipment);
  const byAssetId = new Map(existing.map((e) => [e.assetId.toUpperCase(), e]));
  const byName = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e]));

  let created = 0;
  let updated = 0;

  // ── The 19 AC units, keyed on the tag printed on the unit ───────────────
  for (const u of AC_UNITS) {
    const fields = {
      name: u.name,
      category: u.category,
      subCategory: u.subCategory,
      location: u.location,
      bay: u.bay,
      oem: u.oem,
      model: u.model,
      serialNumber: u.serialNumber,
      lastMaintenanceDate: u.lastMaintenanceDate,
      nextMaintenanceDate: u.nextMaintenanceDate,
      maintenanceFrequency: u.maintenanceFrequency,
      requiresCalibration: false,
      notes: u.notes,
      updatedAt: now(),
    };

    const found = byAssetId.get(u.assetId.toUpperCase());
    if (found) {
      await db.update(equipment).set(fields).where(eq(equipment.id, found.id));
      updated++;
    } else {
      await db.insert(equipment).values({ id: nanoid(), assetId: u.assetId, ...fields });
      created++;
    }
  }

  // ── The 4 instruments, which carry no tag on the source sheet ───────────
  // Untagged in the workshop, so the register assigns the next free number in
  // the PE series and prints it. Matched by name on a re-run, because there is
  // no tag to match on and the serial cannot be trusted: two of these four are
  // recorded against the same one.
  const assignedIds: string[] = [];
  const allIds = existing.map((e) => e.assetId);

  for (const inst of CALIBRATED_INSTRUMENTS) {
    const found = byName.get(inst.name.trim().toLowerCase());
    const fields = {
      name: inst.name,
      category: "MEASURING",
      subCategory: "Test and measurement instrument",
      oem: inst.oem,
      model: inst.model,
      serialNumber: inst.serialNumber,
      requiresCalibration: true,
      notes: inst.notes,
      updatedAt: now(),
    };

    let equipmentId: string;
    let assetId: string;

    if (found) {
      await db.update(equipment).set(fields).where(eq(equipment.id, found.id));
      equipmentId = found.id;
      assetId = found.assetId;
      updated++;
    } else {
      equipmentId = nanoid();
      assetId = nextAssetId(allIds, "PE");
      allIds.push(assetId);
      assignedIds.push(`${assetId}  ${inst.name}`);
      await db.insert(equipment).values({ id: equipmentId, assetId, ...fields });
      created++;
    }

    // The calibration register entry. Status is derived rather than stored by
    // hand, so the expired earth tester reads OVERDUE the moment it lands.
    const calFields = {
      instrumentName: inst.name,
      equipmentId,
      serialNumber: inst.serialNumber,
      make: inst.oem,
      model: inst.model,
      lastCalibrationDate: inst.lastCalibrationDate,
      nextCalibrationDate: inst.nextCalibrationDate,
      calibrationInterval: inst.calibrationInterval,
      calibratedBy: inst.calibratedBy,
      status: statusForNextDate(inst.nextCalibrationDate),
    };

    const [existingCal] = await db
      .select()
      .from(calibrationRecords)
      .where(eq(calibrationRecords.equipmentId, equipmentId));

    if (existingCal) {
      await db.update(calibrationRecords).set(calFields).where(eq(calibrationRecords.id, existingCal.id));
    } else {
      await db.insert(calibrationRecords).values({ id: nanoid(), ...calFields });
    }
  }

  console.log(`✅ ${created} created, ${updated} updated (${AC_UNITS.length} AC units, ${CALIBRATED_INSTRUMENTS.length} instruments)`);

  if (assignedIds.length) {
    console.log("\n🏷️  Asset IDs assigned to the untagged instruments. Label them to match:");
    for (const line of assignedIds) console.log(`   ${line}`);
  }

  console.log("\n⚠️  The source sheets disagree with each other in these places.");
  console.log("   Each is flagged in the asset's notes. Someone has to read the labels:");
  for (const c of CONFLICTS) console.log(`   • ${c}`);
  console.log("\n🎉 Facility asset seed complete.");
}

seedFacilityAssets()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Facility asset seed failed:", e);
    process.exit(1);
  });
