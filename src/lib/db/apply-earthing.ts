// src/lib/db/apply-earthing.ts
// Switches on the Earthing module (LIMSL, 17 Nov 2026) for one database.
//
//   npx tsx --env-file=.env.local src/lib/db/apply-earthing.ts            # dry run: reports, changes nothing
//   npx tsx --env-file=.env.local src/lib/db/apply-earthing.ts --apply    # does it
//
// Three steps, each idempotent, so running it twice changes nothing the second
// time:
//
//   1. The two tables, earth_pits and earth_tests (CREATE ... IF NOT EXISTS;
//      nothing existing is altered). The same statements are in Settings →
//      Database maintenance for a deployment with no terminal.
//   2. The Habotest HT20302 earth resistance tester is a calibratable
//      instrument: an equipment row (MEASURING, requiresCalibration) and a
//      calibration_records row linked to it. An existing record's dates and
//      certificates are never touched; only missing links and blanks are filled.
//   3. The "Earthing system" equipment row the legacy import created
//      (LEE/SYS/0001) comes off the register, retired the way the removal route
//      retires an asset: removed_at/reason/note, an equipment_log line, an
//      audit_log line. Its history is kept. Future plan rows nobody has touched
//      are deleted (the isReplannable rule); anything started, batched,
//      deferred or done is reported and left alone.
import { db } from "@/lib/db";
import { sql, eq, and, isNull, or, ilike, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  equipment,
  calibrationRecords,
  maintenanceSchedule,
  workOrders,
  pmBatches,
  auditLog,
} from "@/lib/db/schema";
import { CALIBRATED_INSTRUMENTS } from "@/lib/facility-assets";
import { nextAssetId } from "@/lib/asset-id";
import { statusForNextDate } from "@/lib/calibration";
import { logEquipmentEvent } from "@/lib/equipment-log";
import { isReplannable } from "@/lib/maintenance/asset-categories";

const APPLY = process.argv.includes("--apply");
const NOW = `to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

const EARTHING_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS earth_pits (
     id               text PRIMARY KEY,
     code             text NOT NULL UNIQUE,
     name             text NOT NULL,
     location         text,
     description      text,
     electrode_type   text,
     limit_ohms       real NOT NULL DEFAULT 5,
     active           boolean NOT NULL DEFAULT true,
     created_by_id    text,
     created_by_name  text,
     created_at       text NOT NULL DEFAULT ${NOW},
     updated_at       text NOT NULL DEFAULT ${NOW}
   )`,
  `CREATE TABLE IF NOT EXISTS earth_tests (
     id                        text PRIMARY KEY,
     test_number               text NOT NULL UNIQUE,
     pit_id                    text NOT NULL REFERENCES earth_pits(id),
     test_date                 text NOT NULL,
     test_time                 text,
     method                    text NOT NULL DEFAULT 'FALL_OF_POTENTIAL',
     instrument_id             text REFERENCES calibration_records(id),
     instrument_label          text,
     instrument_cal_status     text,
     current_probe_distance_m  real,
     readings                  text,
     resistance_ohms           real NOT NULL,
     spread_pct                real,
     consistent                boolean,
     limit_ohms                real,
     verdict                   text NOT NULL,
     soil_condition            text,
     weather                   text,
     remarks                   text,
     tested_by_id              text,
     tested_by_name            text,
     created_at                text NOT NULL DEFAULT ${NOW}
   )`,
  `CREATE INDEX IF NOT EXISTS earth_tests_pit_idx ON earth_tests (pit_id)`,
  `CREATE INDEX IF NOT EXISTS earth_tests_date_idx ON earth_tests (test_date)`,
];

const HABOTEST_SERIAL = "H12D-J051012";
const HABOTEST = {
  instrumentName: "Earth Resistance Tester, Habotest HT20302",
  make: "HABOTEST",
  model: "HT20302",
  serialNumber: HABOTEST_SERIAL,
};
// The certificate dates and interval as the LIMS log recorded them; the
// equipment row is created exactly as facility-assets-load.ts creates it.
const SOURCE = CALIBRATED_INSTRUMENTS.find((i) => i.serialNumber === HABOTEST_SERIAL);

const REMOVED_NOTE = "Earthing is now monitored in the Earthing module (17 Nov 2026).";

const rowsOf = <T,>(res: unknown): T[] =>
  (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[];

const say = (s = "") => console.log(s);
const tag = (done: boolean) => (APPLY ? (done ? "DONE " : "SKIP ") : "WOULD");

async function tableExists(name: string): Promise<boolean> {
  const res = await db.execute(sql`SELECT to_regclass(${`public.${name}`}) AS t`);
  return !!rowsOf<{ t: string | null }>(res)[0]?.t;
}

async function stepTables() {
  say("1. Tables");
  for (const t of ["earth_pits", "earth_tests"]) {
    say(`   ${t}: ${(await tableExists(t)) ? "exists" : "missing"}`);
  }
  if (!APPLY) {
    say(`   WOULD run ${EARTHING_DDL.length} CREATE ... IF NOT EXISTS statements.`);
    return;
  }
  for (const statement of EARTHING_DDL) {
    await db.execute(sql.raw(statement));
    say(`   ok    ${statement.trim().split("\n")[0].slice(0, 70)}`);
  }
}

async function stepInstrument() {
  say("\n2. Habotest HT20302 in the calibration register");
  if (!SOURCE) throw new Error("The Habotest is missing from CALIBRATED_INSTRUMENTS in facility-assets.ts.");

  const candidates = await db
    .select()
    .from(equipment)
    .where(
      or(
        eq(equipment.serialNumber, HABOTEST_SERIAL),
        ilike(equipment.name, "%earth resistance tester%"),
      ),
    );
  // Prefer the serial: it is printed on the instrument, the name is typed.
  const eqRow = candidates.find((c) => c.serialNumber === HABOTEST_SERIAL) ?? candidates[0] ?? null;
  if (candidates.length > 1) {
    say(`   NOTE  ${candidates.length} equipment rows match; using ${eqRow!.assetId} ${eqRow!.name}.`);
  }

  let equipmentId: string | null = eqRow?.id ?? null;

  if (eqRow) {
    say(`   equipment: ${eqRow.assetId} · ${eqRow.name} · category ${eqRow.category} · requiresCalibration ${eqRow.requiresCalibration}`);
    if (eqRow.removedAt) say(`   NOTE  this row is off the register (${eqRow.removedReason}). Left as it is; restore it from the equipment page if that was a mistake.`);
    const fix: Partial<typeof equipment.$inferInsert> = {};
    if (!eqRow.requiresCalibration) fix.requiresCalibration = true;
    if (eqRow.category !== "MEASURING") fix.category = "MEASURING";
    if (Object.keys(fix).length) {
      say(`   ${tag(true)} set ${Object.entries(fix).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      if (APPLY) {
        await db.update(equipment).set({ ...fix, updatedAt: new Date().toISOString() }).where(eq(equipment.id, eqRow.id));
      }
    } else {
      say("   equipment row already correct.");
    }
  } else {
    const all = await db.select({ assetId: equipment.assetId }).from(equipment);
    const assetId = nextAssetId(all.map((a) => a.assetId), "PE");
    say(`   equipment: none found by serial ${HABOTEST_SERIAL} or name.`);
    say(`   ${tag(true)} create ${assetId} · ${SOURCE.name} (MEASURING, requiresCalibration) — label the instrument with this number.`);
    if (APPLY) {
      equipmentId = nanoid();
      await db.insert(equipment).values({
        id: equipmentId,
        assetId,
        name: SOURCE.name,
        category: "MEASURING",
        subCategory: "Test and measurement instrument",
        oem: SOURCE.oem,
        model: SOURCE.model,
        serialNumber: SOURCE.serialNumber,
        requiresCalibration: true,
        notes: SOURCE.notes,
      });
      await db.insert(auditLog).values({
        id: nanoid(),
        userName: "System",
        action: "CREATE",
        entityType: "equipment",
        entityId: equipmentId,
        entityDescription: `${assetId} ${SOURCE.name} added to the register as a calibratable instrument (Earthing module set-up)`,
      });
    }
  }

  const calConds = [
    eq(calibrationRecords.serialNumber, HABOTEST_SERIAL),
    ilike(calibrationRecords.instrumentName, "%habotest%"),
    ilike(calibrationRecords.instrumentName, "%earth resistance%"),
  ];
  if (equipmentId) calConds.push(eq(calibrationRecords.equipmentId, equipmentId));
  const cals = await db.select().from(calibrationRecords).where(or(...calConds));
  const cal =
    cals.find((c) => equipmentId && c.equipmentId === equipmentId) ??
    cals.find((c) => c.serialNumber === HABOTEST_SERIAL) ??
    cals[0] ??
    null;

  if (cal) {
    say(
      `   calibration record: ${cal.instrumentName} · last ${cal.lastCalibrationDate ?? "-"} · next ${cal.nextCalibrationDate ?? "-"} · ` +
        `status now ${cal.status === "OUT_OF_SERVICE" ? "OUT_OF_SERVICE" : statusForNextDate(cal.nextCalibrationDate)}`,
    );
    // Fill blanks and the link only. Dates, certificates and status belong to
    // the calibration register and are never overwritten from here.
    const fill: Partial<typeof calibrationRecords.$inferInsert> = {};
    if (!cal.equipmentId && equipmentId) fill.equipmentId = equipmentId;
    if (!cal.make) fill.make = HABOTEST.make;
    if (!cal.model) fill.model = HABOTEST.model;
    if (!cal.serialNumber) fill.serialNumber = HABOTEST.serialNumber;
    if (Object.keys(fill).length) {
      say(`   ${tag(true)} fill ${Object.keys(fill).join(", ")} (dates and certificates untouched)`);
      if (APPLY) await db.update(calibrationRecords).set(fill).where(eq(calibrationRecords.id, cal.id));
    } else {
      say("   calibration record already linked and complete.");
    }
    if (!cal.equipmentId && !equipmentId) say("   NOTE  record has no equipment row to link to (dry run creates none).");
  } else {
    const status = statusForNextDate(SOURCE.nextCalibrationDate);
    say(
      `   calibration record: none. ${tag(true)} create "${HABOTEST.instrumentName}", last ${SOURCE.lastCalibrationDate}, ` +
        `next ${SOURCE.nextCalibrationDate}, interval ${SOURCE.calibrationInterval} days → ${status}.`,
    );
    if (APPLY) {
      const id = nanoid();
      await db.insert(calibrationRecords).values({
        id,
        ...HABOTEST,
        equipmentId,
        lastCalibrationDate: SOURCE.lastCalibrationDate,
        nextCalibrationDate: SOURCE.nextCalibrationDate,
        calibrationInterval: SOURCE.calibrationInterval,
        calibratedBy: SOURCE.calibratedBy,
        status,
      });
      await db.insert(auditLog).values({
        id: nanoid(),
        userName: "System",
        action: "CREATE",
        entityType: "calibration",
        entityId: id,
        entityDescription: `${HABOTEST.instrumentName} (S/N ${HABOTEST_SERIAL}) entered in the calibration register, ${status} (Earthing module set-up)`,
      });
    }
  }
}

async function stepRetireEarthingSystem() {
  say("\n3. The earthing-system equipment row");
  // LEE/SYS/0001 only when it IS the earthing row: the import numbers tag-less
  // systems in the order the sheet lists them, so on another database that
  // number may belong to something else.
  const rows = await db
    .select()
    .from(equipment)
    .where(
      and(
        isNull(equipment.removedAt),
        or(
          and(eq(equipment.assetId, "LEE/SYS/0001"), ilike(equipment.name, "%earth%")),
          and(ilike(equipment.name, "%earthing%"), inArray(equipment.category, ["SYSTEM", "EARTHING"])),
        ),
      ),
    );

  if (rows.length === 0) {
    say("   nothing to retire (no earthing-system row on the register).");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const r of rows) {
    say(`   ${r.assetId} · ${r.name} · category ${r.category} · status ${r.status}`);

    const plan = await db.select().from(maintenanceSchedule).where(eq(maintenanceSchedule.equipmentId, r.id));
    const removable = plan.filter((p) => isReplannable(p, today));
    const kept = plan.filter((p) => !isReplannable(p, today));
    const openWos = await db
      .select({ n: workOrders.workOrderNumber, status: workOrders.status })
      .from(workOrders)
      .where(eq(workOrders.equipmentId, r.id));
    const live = openWos.filter((w) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(String(w.status)));
    const batchIds = [...new Set(plan.map((p) => p.batchId).filter((b): b is string => !!b))];
    const batches = batchIds.length
      ? await db.select({ n: pmBatches.batchNumber, status: pmBatches.status }).from(pmBatches).where(inArray(pmBatches.id, batchIds))
      : [];

    say(`   plan rows: ${plan.length} (${removable.length} future and untouched, ${kept.length} kept as history or decisions)`);
    for (const p of removable) say(`     ${tag(true)} delete plan row ${p.plannedDate} ${p.activityType}`);
    for (const p of kept.filter((k) => k.status !== "COMPLETED")) {
      say(`     keep   ${p.plannedDate} ${p.activityType} ${p.status}${p.workOrderId ? " (has a work order)" : ""}${p.batchId ? " (batched)" : ""}${p.deferredAt ? " (deferred)" : ""}`);
    }
    if (live.length) say(`   NOTE  open work orders still on it: ${live.map((w) => `${w.n} (${w.status})`).join(", ")}. Close or cancel them by hand.`);
    if (batches.length) say(`   NOTE  PM batches that included it: ${batches.map((b) => `${b.n} (${b.status})`).join(", ")}. Left alone.`);
    say(`   ${tag(true)} remove from the register: reason OTHER, "${REMOVED_NOTE}"`);

    if (!APPLY) continue;

    if (removable.length) {
      await db.delete(maintenanceSchedule).where(inArray(maintenanceSchedule.id, removable.map((p) => p.id)));
    }
    const now = new Date().toISOString();
    await db
      .update(equipment)
      .set({
        removedAt: now,
        removedReason: "OTHER",
        removedNote: REMOVED_NOTE,
        removedById: null,
        removedByName: "System",
        updatedAt: now,
      })
      .where(eq(equipment.id, r.id));
    await logEquipmentEvent({
      equipmentId: r.id,
      category: "TRANSFER",
      title: "Removed from the register: Other",
      detail: REMOVED_NOTE,
      source: "AUTO",
      performedByName: "System",
    });
    await db.insert(auditLog).values({
      id: nanoid(),
      userName: "System",
      action: "UPDATE",
      entityType: "equipment",
      entityId: r.id,
      entityDescription:
        `${r.assetId} ${r.name} removed from the register (Other): ${REMOVED_NOTE}` +
        (removable.length ? ` ${removable.length} future plan row(s) deleted.` : ""),
    });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Refusing to guess which database to change.");
    process.exit(1);
  }
  say(APPLY ? "APPLYING changes.\n" : "DRY RUN: nothing will be changed. Re-run with --apply to make these changes.\n");
  await stepTables();
  await stepInstrument();
  await stepRetireEarthingSystem();
  say(APPLY ? "\nDone." : "\nDry run complete. Nothing was changed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
