// src/lib/db/clear-calibration-data.ts
// Emptying the calibration register down to the instruments themselves.
//
// The 21 instruments carried dates from the old spreadsheet with no certificate
// and no event history behind any of them, so every "Current" on the register
// was a claim nothing could back. LIMSL decided (10 Nov 2026) that a
// calibration is recorded with its certificate attached or not at all, and that
// the register starts again from the instruments: name, serial, make, model and
// the machine each belongs to stay; dates, interval, certificate and
// traceability go, and each instrument reads "Not calibrated" until someone
// records its calibration with the certificate.
//
// Calibration events are left alone (there were none when this was written; any
// that exist are real records). A JSON backup of what is cleared is written
// first, and the audit log gets one line for the whole change.
//
//   DATABASE_URL=... npx tsx src/lib/db/clear-calibration-data.ts --dry-run
//   DATABASE_URL=... npx tsx src/lib/db/clear-calibration-data.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { calibrationRecords, calibrationEvents, auditLog } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }

  const records = await db.select().from(calibrationRecords);
  const events = await db.select({ instrumentId: calibrationEvents.instrumentId }).from(calibrationEvents);
  // An instrument with a real event behind it was calibrated through the app,
  // with its certificate; that is the record this exercise is making room for.
  const withHistory = new Set(events.map((e) => e.instrumentId));
  const targets = records.filter((r) => !withHistory.has(r.id));

  console.log(`\nInstruments: ${records.length}; clearing ${targets.length}, keeping ${withHistory.size} with event history.`);
  for (const r of targets) {
    console.log(`  ${r.instrumentName}${r.serialNumber ? ` (S/N ${r.serialNumber})` : ""}  last ${r.lastCalibrationDate ?? "-"}  next ${r.nextCalibrationDate ?? "-"}`);
  }
  if (dryRun || targets.length === 0) {
    console.log(dryRun ? "\n--dry-run: nothing changed." : "\nNothing to do.");
    process.exit(0);
  }

  const dir = join(process.cwd(), "storage", "backups");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `calibration-register-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(targets, null, 2));
  console.log(`\nBackup: ${file}`);

  await db.transaction(async () => {
    await db
      .update(calibrationRecords)
      .set({
        lastCalibrationDate: null,
        nextCalibrationDate: null,
        calibrationInterval: null,
        calibratedBy: null,
        certificateNumber: null,
        certificateUrl: null,
        traceableTo: null,
        referenceStandardId: null,
        labName: null,
        labAccreditationNo: null,
        accreditationBody: null,
        status: "NOT_CALIBRATED",
      })
      .where(inArray(calibrationRecords.id, targets.map((r) => r.id)));
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: null,
      userName: "System (clean slate)",
      action: "UPDATE",
      entityType: "calibration_records",
      entityId: "bulk",
      entityDescription: `Calibration register reset to instruments only: dates, intervals, certificates and traceability cleared on ${targets.length} instruments with no certificate or event history. Each reads Not calibrated until calibrated with its certificate attached.`,
    });
  });
  console.log(`Cleared ${targets.length} instruments.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
