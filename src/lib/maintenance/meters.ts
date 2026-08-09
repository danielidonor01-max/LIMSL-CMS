// src/lib/maintenance/meters.ts
// Servicing by how hard a machine has actually worked, not by the calendar.
//
// A compressor serviced "quarterly" is serviced on the same day whether it ran
// three shifts a day or sat idle for two months. For run-hours assets, // compressors, cranes, gensets, the calendar is a proxy for use, and a bad one:
// it over-services the idle machine (wasting parts and downtime) and
// under-services the hard-worked one, which is the failure that actually costs
// production.
//
// The whole feature is: record readings, compare against the interval, and
// project the due date from observed usage rather than assuming it.

export type MeterUnit = "HOURS" | "CYCLES" | "KM";

export const METER_UNIT_LABELS: Record<MeterUnit, string> = {
  HOURS: "running hours",
  CYCLES: "cycles",
  KM: "kilometres",
};

export const METER_UNIT_SHORT: Record<MeterUnit, string> = {
  HOURS: "hrs",
  CYCLES: "cycles",
  KM: "km",
};

export const isMeterUnit = (v: unknown): v is MeterUnit =>
  typeof v === "string" && ["HOURS", "CYCLES", "KM"].includes(v.toUpperCase());

export type MeterStatus = "OVERDUE" | "DUE" | "DUE_SOON" | "OK" | "NO_READING" | "NOT_CONFIGURED";

// NO_READING is deliberately separate from NOT_CONFIGURED: one means nobody has
// decided how often to service the machine, the other means nobody has looked at
// it. They need different actions, and neither is "fine".
export const METER_STATUS_LABELS: Record<MeterStatus, string> = {
  OVERDUE: "Service overdue",
  DUE: "Service due now",
  DUE_SOON: "Service due soon",
  OK: "Within interval",
  NO_READING: "No reading taken yet",
  NOT_CONFIGURED: "No meter interval set",
};

export const METER_STATUS_BADGE: Record<MeterStatus, string> = {
  OVERDUE: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  DUE: "bg-orange-500/10 text-orange-700 border-orange-500/20",
  DUE_SOON: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  OK: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  NO_READING: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  NOT_CONFIGURED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

// "Due soon" starts at this share of the interval consumed.
export const DUE_SOON_THRESHOLD = 0.9;

export type MeterState = {
  status: MeterStatus;
  used: number;        // units since the last service
  remaining: number;   // units until the next one (negative once overdue)
  fraction: number;    // share of the interval consumed; >1 means overdue
  percent: number;     // the same, clamped to 0-100 for a progress bar
};

export function meterState(
  currentReading: number | null | undefined,
  readingAtLastService: number | null | undefined,
  interval: number | null | undefined,
): MeterState {
  const last = Number(readingAtLastService ?? 0);
  const step = Number(interval);

  const idle = { used: 0, remaining: 0, fraction: 0, percent: 0 };
  if (!Number.isFinite(step) || step <= 0) return { status: "NOT_CONFIGURED", ...idle };

  // Number(null) is 0, so an unread meter used to look like a machine sitting at
  // zero hours, reported as comfortably within interval. A green tick for an
  // asset nobody has measured is the worst answer available here.
  if (currentReading === null || currentReading === undefined || String(currentReading).trim() === "") {
    return { status: "NO_READING", ...idle };
  }
  const current = Number(currentReading);
  if (!Number.isFinite(current)) return { status: "NO_READING", ...idle };

  // A reading below the last service means the meter was replaced or reset.
  // Treating that as negative usage would silently defer the service forever.
  const used = Math.max(0, current - (Number.isFinite(last) ? last : 0));
  const remaining = step - used;
  const fraction = used / step;

  const status: MeterStatus =
    remaining < 0 ? "OVERDUE" : remaining === 0 ? "DUE" : fraction >= DUE_SOON_THRESHOLD ? "DUE_SOON" : "OK";

  return {
    status,
    used: round1(used),
    remaining: round1(remaining),
    fraction,
    percent: Math.max(0, Math.min(100, Math.round(fraction * 100))),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export type Reading = { reading: number; readingDate: string };

// Units consumed per calendar day, from the readings we actually have. Two
// readings is the minimum that says anything; below that we decline rather than
// invent a rate, because a projected date from one data point is a guess wearing
// a number's clothing.
export function usageRatePerDay(readings: Reading[]): number | null {
  const usable = readings
    .filter((r) => Number.isFinite(Number(r.reading)) && !Number.isNaN(Date.parse(`${r.readingDate}T00:00:00Z`)))
    .sort((a, b) => a.readingDate.localeCompare(b.readingDate));
  if (usable.length < 2) return null;

  const first = usable[0];
  const last = usable[usable.length - 1];
  const days = Math.round(
    (Date.parse(`${last.readingDate}T00:00:00Z`) - Date.parse(`${first.readingDate}T00:00:00Z`)) / 86_400_000,
  );
  if (days <= 0) return null;

  const delta = Number(last.reading) - Number(first.reading);
  if (delta <= 0) return null; // idle or reset, no meaningful rate
  return delta / days;
}

// When the service will fall due, given how the machine is actually being used.
// Null when we cannot say honestly.
export function projectedDueDate(
  remaining: number,
  ratePerDay: number | null,
  from: Date = new Date(),
): string | null {
  if (ratePerDay === null || ratePerDay <= 0) return null;
  if (remaining <= 0) return from.toISOString().slice(0, 10); // already due
  const days = Math.ceil(remaining / ratePerDay);
  if (!Number.isFinite(days) || days > 3650) return null; // beyond ten years is noise
  const due = new Date(from.getTime() + days * 86_400_000);
  return due.toISOString().slice(0, 10);
}

// A new reading must move forward. Anything else is a typo or a meter swap, and
// accepting it corrupts both the service interval and the usage rate.
export function validateReading(
  newReading: unknown,
  previousReading: number | null | undefined,
  allowReset = false,
): { ok: true; reading: number } | { ok: false; error: string } {
  const value = Number(newReading);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: "Enter the meter reading as a positive number." };
  }
  const prev = Number(previousReading);
  if (Number.isFinite(prev) && value < prev && !allowReset) {
    return {
      ok: false,
      error: `The last reading was ${prev}. A meter cannot go backwards, check the figure, or tick "meter was replaced or reset" if that is what happened.`,
    };
  }
  return { ok: true, reading: value };
}
