// src/lib/calibration.ts
// calibrationRecords is the ONE calibration truth for a machine. Whatever the
// register shows about calibration (the requiresCalibration flag, the due date,
// the overdue state) is derived from those records — never maintained by hand
// in parallel. Every writer of calibration records (the calibration API, the
// legacy register import) calls syncEquipmentCalibration() after its write so
// the equipment flag can never drift from the records that justify it.
//
// calibrationRecords is now the instrument MASTER only. The history of what was
// actually measured lives in append-only calibrationEvents — rolling an
// instrument forward used to overwrite the previous date, certificate and
// result, which made a calibration history impossible to produce (ISO 9001
// 7.1.5.2 / 7.5.3). The master's date/status columns are a derived cache of the
// newest event; the event rows are the evidence.
import { db } from "@/lib/db";
import { calibrationRecords, calibrationEvents, equipment } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";

export type CalibrationRecord = typeof calibrationRecords.$inferSelect;
export type CalibrationEvent = typeof calibrationEvents.$inferSelect;

export type CalibrationStatus = {
  latest: CalibrationRecord | null;
  latestEvent: CalibrationEvent | null;
  nextDue: string | null;
  overdue: boolean;
};

export const AS_FOUND_VALUES = ["IN_TOLERANCE", "OUT_OF_TOLERANCE", "NOT_CHECKED"] as const;
export const AS_LEFT_VALUES = ["IN_TOLERANCE", "ADJUSTED", "REJECTED"] as const;
export const VERDICT_VALUES = ["PASS", "FAIL"] as const;

// 7.1.5.2(a): "traceable to international or national measurement standards".
// A name in "calibrated by" is not traceability — either the standard the
// instrument was measured against, or the laboratory that performed the
// calibration, has to be on the record for the certificate to mean anything.
export const TRACEABILITY_REQUIRED_MESSAGE =
  "Measurement traceability is required (ISO 9001:2015 7.1.5.2). Record either the standard this calibration was traced to " +
  "(e.g. \"NIST via reference standard SN-4471\") or the calibration laboratory that performed it. A calibration with neither " +
  "cannot be shown to be traceable to a national or international measurement standard.";

export function traceabilityError(input: { traceableTo?: unknown; labName?: unknown }): string | null {
  const tracedTo = String(input.traceableTo ?? "").trim();
  const lab = String(input.labName ?? "").trim();
  return tracedTo || lab ? null : TRACEABILITY_REQUIRED_MESSAGE;
}

// Returns the canonical enum value, or null when the caller sent something that
// isn't one — a silent fallback would record a calibration result nobody stated.
export function normalizeCalibrationEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T,
): T | null {
  const v = String(raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!v) return fallback;
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function statusForNextDate(nextDate: string | null | undefined, now: number = Date.now()): string {
  if (!nextDate) return "CURRENT";
  const days = Math.round((new Date(nextDate).getTime() - now) / 864e5);
  if (days < 0) return "OVERDUE";
  if (days <= 30) return "DUE_SOON";
  return "CURRENT";
}

// An instrument found outside tolerance casts doubt backwards over everything
// measured with it; a failed calibration is not a "due soon" — it is unusable.
export function isSuspectCalibration(ev: { verdict?: string | null; asFound?: string | null }): boolean {
  return ev.verdict === "FAIL" || ev.asFound === "OUT_OF_TOLERANCE";
}

export function deriveInstrumentStatus(
  ev: { verdict?: string | null; asFound?: string | null; nextCalibrationDate?: string | null },
  now: number = Date.now(),
): string {
  return isSuspectCalibration(ev) ? "OUT_OF_SERVICE" : statusForNextDate(ev.nextCalibrationDate ?? null, now);
}

function daysBetween(from: string, to: string): number {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 864e5));
}

// The clause's actual requirement: when an instrument is found out of tolerance
// the organisation "shall take appropriate action ... as to the validity of
// previous measurement results". The window that has to be assessed runs from
// the last calibration known to be in tolerance to this one, so the NC has to
// name both ends of it.
export function outOfToleranceNcDescription(input: {
  instrumentName: string;
  serialNumber?: string | null;
  calibrationDate: string;
  verdict: string;
  asFound?: string | null;
  asLeft?: string | null;
  certificateNumber?: string | null;
  lastGoodDate: string | null;
  lastGoodIsRegistration?: boolean;
}): string {
  const sn = input.serialNumber ? ` (S/N ${input.serialNumber})` : "";
  const cert = input.certificateNumber ? `, certificate ${input.certificateNumber}` : "";
  const asFound = input.asFound ?? "NOT_CHECKED";
  const asLeft = input.asLeft ?? "not recorded";
  const head =
    `Measuring instrument failed calibration — ${input.instrumentName}${sn}. ` +
    `Calibration on ${input.calibrationDate} returned ${input.verdict} (as-found ${asFound}, as-left ${asLeft})${cert}. `;

  const window = input.lastGoodDate
    ? input.lastGoodIsRegistration
      ? `No previous in-tolerance calibration is on record; the instrument has been in the register since ${input.lastGoodDate}. ` +
        `Every measurement, inspection, test and acceptance decision made with it between ${input.lastGoodDate} and ` +
        `${input.calibrationDate} (${daysBetween(input.lastGoodDate, input.calibrationDate)} days)`
      : `Last calibration known to be in tolerance: ${input.lastGoodDate}. ` +
        `Every measurement, inspection, test and acceptance decision made with this instrument between ${input.lastGoodDate} and ` +
        `${input.calibrationDate} (${daysBetween(input.lastGoodDate, input.calibrationDate)} days)`
    : `No previous in-tolerance calibration and no registration date are on record, so the whole service life of this instrument ` +
      `up to ${input.calibrationDate} is affected. Every measurement, inspection, test and acceptance decision made with it`;

  return (
    head +
    window +
    ` is of unverified validity and must be assessed, with affected product and equipment re-verified where that assessment requires it ` +
    `(ISO 9001:2015 7.1.5.2). The instrument has been placed OUT OF SERVICE pending adjustment, repair or replacement.`
  );
}

// Order key for "which event is newest" — the calibration date is what matters,
// with the insertion timestamp breaking ties between two events dated the same
// day (a re-calibration after an adjustment on the same visit).
export function eventOrderKey(ev: { calibrationDate?: string | null; createdAt?: string | null }): string {
  return `${ev.calibrationDate ?? ""}|${ev.createdAt ?? ""}`;
}

export function newestEvent<T extends { calibrationDate?: string | null; createdAt?: string | null }>(
  events: T[],
): T | null {
  if (events.length === 0) return null;
  return [...events].sort((a, b) => eventOrderKey(b).localeCompare(eventOrderKey(a)))[0];
}

// A machine can carry several calibrated instruments. Its "latest" is the most
// recent calibration event across them; its due date is the SOONEST instrument
// due date — one overdue instrument makes the whole machine overdue. Events are
// preferred over the master row wherever both exist: the master is only a cache
// and instruments registered before the event table exists have no events yet.
export async function getCalibrationStatus(equipmentId: string): Promise<CalibrationStatus> {
  const records = await db
    .select()
    .from(calibrationRecords)
    .where(eq(calibrationRecords.equipmentId, equipmentId));
  if (records.length === 0) return { latest: null, latestEvent: null, nextDue: null, overdue: false };

  const events = await db
    .select()
    .from(calibrationEvents)
    .where(
      inArray(
        calibrationEvents.instrumentId,
        records.map((r) => r.id),
      ),
    );

  const newestPerInstrument = new Map<string, CalibrationEvent>();
  for (const ev of events) {
    const current = newestPerInstrument.get(ev.instrumentId);
    if (!current || eventOrderKey(ev).localeCompare(eventOrderKey(current)) > 0) {
      newestPerInstrument.set(ev.instrumentId, ev);
    }
  }

  const lastDateOf = (r: CalibrationRecord) =>
    newestPerInstrument.get(r.id)?.calibrationDate ?? r.lastCalibrationDate ?? r.createdAt ?? "";
  const nextDueOf = (r: CalibrationRecord) =>
    newestPerInstrument.get(r.id)?.nextCalibrationDate ?? r.nextCalibrationDate ?? null;

  const latest = [...records].sort((a, b) => lastDateOf(b).localeCompare(lastDateOf(a)))[0];
  const latestEvent = newestEvent([...newestPerInstrument.values()]);
  const dues = records
    .map(nextDueOf)
    .filter((d): d is string => !!d)
    .sort();
  const nextDue = dues[0] ?? null;
  const overdue = !!nextDue && nextDue < new Date().toISOString().slice(0, 10);
  return { latest, latestEvent, nextDue, overdue };
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
