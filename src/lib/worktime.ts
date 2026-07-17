// src/lib/worktime.ts
// Production-time arithmetic. Downtime and repair clocks must count *production
// hours*, not wall-clock hours — a machine that fails at 4pm Friday and is fixed
// 9am Monday was not "down 65 hours"; it was down for the ~2 production hours the
// workshop would otherwise have been running. Every function here takes a
// WorkSettings so the working window is a Super-Admin setting, never hardcoded.
//
// This module is pure (no DB, no `new Date()` on the wall clock) so it can run
// identically on the server (source of truth) and in the browser (live preview).

export type WorkSettings = {
  workDayStart: string; // "HH:MM" local wall-clock
  workDayEnd: string; // "HH:MM"
  lunchStart: string | null; // "HH:MM" or null for no break
  lunchEnd: string | null;
  workingDays: number[]; // JS weekday numbers, 0=Sun … 6=Sat
  weekendOvertime: boolean; // if true, Sat/Sun also count as production days
};

// Standard LIMSL shift: 08:00–17:00, lunch 12:00–13:00, Mon–Fri, no weekend work.
export const DEFAULT_WORK_SETTINGS: WorkSettings = {
  workDayStart: "08:00",
  workDayEnd: "17:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  workingDays: [1, 2, 3, 4, 5],
  weekendOvertime: false,
};

const MS_PER_HOUR = 3_600_000;

// Minutes since midnight for a "HH:MM" string; null/blank → null.
function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

// Overlap (ms) of two intervals [aStart,aEnd] and [bStart,bEnd].
function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// Is `dow` (0=Sun..6=Sat) a production day under these settings?
export function isProductionDay(dow: number, s: WorkSettings): boolean {
  if (s.workingDays.includes(dow)) return true;
  if (s.weekendOvertime && (dow === 0 || dow === 6)) return true;
  return false;
}

// Productive hours in one full working day (window minus lunch).
export function productiveHoursPerDay(s: WorkSettings): number {
  const start = toMinutes(s.workDayStart) ?? 0;
  const end = toMinutes(s.workDayEnd) ?? 0;
  if (end <= start) return 0;
  const ls = toMinutes(s.lunchStart);
  const le = toMinutes(s.lunchEnd);
  let lunch = 0;
  if (ls != null && le != null && le > ls) {
    // Only the part of lunch that falls inside the working window counts.
    lunch = Math.max(0, Math.min(le, end) - Math.max(ls, start));
  }
  return Math.max(0, end - start - lunch) / 60;
}

// Timestamp (ms) of a "HH:MM" on the calendar day of `dayMidnight`.
function atTime(dayMidnight: Date, hhmm: string | null): number {
  const mins = toMinutes(hhmm);
  if (mins == null) return dayMidnight.getTime();
  return dayMidnight.getTime() + mins * 60_000;
}

// Production hours a machine was down between two local datetimes. Accepts ISO
// strings or `datetime-local` values ("YYYY-MM-DDTHH:MM"). Returns 0 for an
// invalid or reversed range.
export function productionDowntimeHours(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  s: WorkSettings,
): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startMs = start.getTime();
  const endMs = end.getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return 0;

  let ms = 0;
  // Walk each calendar day the outage touches, summing the production window it
  // overlaps. Iterating on local Y/M/D keeps day boundaries at local midnight.
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();

  while (cursor.getTime() <= lastDay) {
    if (isProductionDay(cursor.getDay(), s)) {
      const dayStart = atTime(cursor, s.workDayStart);
      const dayEnd = atTime(cursor, s.workDayEnd);
      let day = overlap(startMs, endMs, dayStart, dayEnd);
      if (s.lunchStart && s.lunchEnd) {
        day -= overlap(startMs, endMs, atTime(cursor, s.lunchStart), atTime(cursor, s.lunchEnd));
      }
      ms += Math.max(0, day);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return +(ms / MS_PER_HOUR).toFixed(2);
}

// Count of production days in a calendar month (monthKey = "YYYY-MM").
export function productionDaysInMonth(monthKey: string, s: WorkSettings): number {
  const [y, m] = monthKey.split("-").map((x) => parseInt(x, 10));
  if (!y || !m) return 0;
  const days = new Date(y, m, 0).getDate(); // day 0 of next month = last day of this
  let count = 0;
  for (let d = 1; d <= days; d++) {
    if (isProductionDay(new Date(y, m - 1, d).getDay(), s)) count++;
  }
  return count;
}

// Planned production hours for a month — the availability/MTBF baseline per asset.
export function plannedHoursForMonth(monthKey: string, s: WorkSettings): number {
  return productionDaysInMonth(monthKey, s) * productiveHoursPerDay(s);
}
