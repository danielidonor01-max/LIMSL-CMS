// src/lib/calibration.ts
// calibrationRecords is the ONE calibration truth for a machine. Whatever the
// register shows about calibration (the requiresCalibration flag, the due date,
// the overdue state) is derived from those records — never maintained by hand
// in parallel. Every writer of calibration records (the calibration API, the
// legacy register import) calls syncEquipmentCalibration() after its write so
// the equipment flag can never drift from the records that justify it.
import { db } from "@/lib/db";
import { calibrationRecords, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type CalibrationRecord = typeof calibrationRecords.$inferSelect;

export type CalibrationStatus = {
  latest: CalibrationRecord | null;
  nextDue: string | null;
  overdue: boolean;
};

// A machine can carry several calibrated instruments. Its "latest" is the most
// recent calibration event across them; its due date is the SOONEST instrument
// due date — one overdue instrument makes the whole machine overdue.
export async function getCalibrationStatus(equipmentId: string): Promise<CalibrationStatus> {
  const records = await db
    .select()
    .from(calibrationRecords)
    .where(eq(calibrationRecords.equipmentId, equipmentId));
  if (records.length === 0) return { latest: null, nextDue: null, overdue: false };

  const latest = [...records].sort((a, b) =>
    (b.lastCalibrationDate ?? b.createdAt ?? "").localeCompare(a.lastCalibrationDate ?? a.createdAt ?? ""),
  )[0];
  const dues = records
    .map((r) => r.nextCalibrationDate)
    .filter((d): d is string => !!d)
    .sort();
  const nextDue = dues[0] ?? null;
  const overdue = !!nextDue && nextDue < new Date().toISOString().slice(0, 10);
  return { latest, nextDue, overdue };
}

// Derive equipment.requiresCalibration from the records. The schema carries no
// per-equipment next-calibration column (due dates live only on the records),
// so the flag is the whole derived surface. Records only ever *prove* a
// calibration requirement — an empty set doesn't disprove one (a machine can be
// flagged before its first certificate arrives), so the flag is never cleared.
export async function syncEquipmentCalibration(equipmentId: string): Promise<void> {
  const [rec] = await db
    .select({ id: calibrationRecords.id })
    .from(calibrationRecords)
    .where(eq(calibrationRecords.equipmentId, equipmentId))
    .limit(1);
  if (!rec) return;

  const [eqRow] = await db
    .select({ requiresCalibration: equipment.requiresCalibration })
    .from(equipment)
    .where(eq(equipment.id, equipmentId))
    .limit(1);
  if (!eqRow || eqRow.requiresCalibration) return;

  await db
    .update(equipment)
    .set({ requiresCalibration: true, updatedAt: new Date().toISOString() })
    .where(eq(equipment.id, equipmentId));
}
