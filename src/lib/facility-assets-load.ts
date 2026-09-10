// src/lib/facility-assets-load.ts
// Writes the office AC units and calibrated instruments into the register.
//
// Separate from the seed script beside it so the deployed app can run the same
// load from Settings. Schema changes already work that way (db-maintenance),
// and this database is only reachable from the deployed app, so a load that
// needs a terminal and a connection string is a load that does not happen.
//
// Upserts, never deletes. The demo seeds in src/lib/db clear the tables they
// own before writing, which is right for a scratch database and wrong here:
// these are real assets going into a register that already holds real machines.
//
// `status` and `criticality` are left alone on rows that already exist. A unit
// a technician marked BROKEN_DOWN must not be reset to OPERATIONAL because
// somebody pressed the button again.

import { db } from "./db";
import { equipment, calibrationRecords } from "./db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { AC_UNITS, CALIBRATED_INSTRUMENTS, CONFLICTS } from "./facility-assets";
import { nextAssetId } from "./asset-id";
import { statusForNextDate } from "./calibration";

export type FacilityLoadResult = {
  created: number;
  updated: number;
  /** Numbers handed to the instruments that carry no tag, so they can be labelled. */
  assigned: { assetId: string; name: string }[];
  /** What the source sheets could not settle. Needs somebody to read a label. */
  conflicts: readonly string[];
};

export async function loadFacilityAssets(): Promise<FacilityLoadResult> {
  const existing = await db.select().from(equipment);
  const byAssetId = new Map(existing.map((e) => [e.assetId.toUpperCase(), e]));
  const byName = new Map(existing.map((e) => [e.name.trim().toLowerCase(), e]));

  const stamp = new Date().toISOString();
  let created = 0;
  let updated = 0;

  // ── The AC units, keyed on the tag printed on the unit ──────────────────
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
      updatedAt: stamp,
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

  // ── The instruments, which carry no tag on the source sheet ─────────────
  // Untagged in the workshop, so the next free number in the PE series is
  // handed out and reported back. Matched by name on a re-run: there is no tag
  // to match on and the serial cannot be trusted, because two of these four
  // are recorded against the same one.
  const assigned: { assetId: string; name: string }[] = [];
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
      updatedAt: stamp,
    };

    let equipmentId: string;

    if (found) {
      await db.update(equipment).set(fields).where(eq(equipment.id, found.id));
      equipmentId = found.id;
      updated++;
    } else {
      equipmentId = nanoid();
      const assetId = nextAssetId(allIds, "PE");
      allIds.push(assetId);
      assigned.push({ assetId, name: inst.name });
      await db.insert(equipment).values({ id: equipmentId, assetId, ...fields });
      created++;
    }

    // Status is derived rather than typed in, so the expired earth tester reads
    // OVERDUE the moment it lands rather than whenever somebody notices.
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

  return { created, updated, assigned, conflicts: CONFLICTS };
}
