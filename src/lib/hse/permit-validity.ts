// src/lib/hse/permit-validity.ts
// A LIMSL permit runs for a fixed validity period, seven calendar days by
// default, and is renewed one day at a time by the Asset Holder Supervisor. The
// Validity & Renewal grid on the paper form is the record of which of those days
// work actually happened on: a day worked carries a date, a time and a
// signature, a day not worked is struck through.
//
// Two things follow from that, and both are the point of this module:
//   • Calendar days, not working days. The grid has a column for Saturday and
//     Sunday, so a permit issued on a Thursday still expires the following
//     Wednesday whether or not the weekend was worked.
//   • The permit expires on schedule regardless of progress. When the days run
//     out and the job is not finished, the permit is closed as work ongoing and
//     a successor is raised against it. A permit is never quietly extended,
//     because the signatures on it authorised a specific week.

export const DEFAULT_PERMIT_VALIDITY_DAYS = 7;

export type DayStatus = "WORKED" | "NOT_WORKED";

export type RenewalDay = {
  date: string;
  status: DayStatus;
  time?: string | null;
  signedById?: string | null;
  signedByName?: string | null;
  signatureData?: string | null;
  amendedFrom?: string | null;
  markedAt?: string | null;
};

export type RenewalMarks = Record<string, RenewalDay>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value);
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// Validity is clamped rather than trusted. A permit for 0 days authorises
// nothing, and one for 90 days is a standing licence that no longer resembles a
// permit, which is exactly what a permit system exists to prevent.
export function normaliseValidityDays(value: unknown): number {
  const n = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PERMIT_VALIDITY_DAYS;
  return Math.min(Math.trunc(n), 31);
}

export function permitDays(startDate: string, validityDays: number): string[] {
  const days = normaliseValidityDays(validityDays);
  return Array.from({ length: days }, (_, i) => addDays(startDate, i));
}

// Inclusive. A 7-day permit starting Monday is still valid on the Sunday.
export function expiryDateOf(startDate: string, validityDays: number): string {
  return addDays(startDate, normaliseValidityDays(validityDays) - 1);
}

export function isWithinWindow(startDate: string, validityDays: number, date: string): boolean {
  return date >= startDate && date <= expiryDateOf(startDate, validityDays);
}

export function isExpiredOn(startDate: string, validityDays: number, today: string): boolean {
  return today > expiryDateOf(startDate, validityDays);
}

export function daysRemaining(startDate: string, validityDays: number, today: string): number {
  const remaining = daysBetween(today, expiryDateOf(startDate, validityDays)) + 1;
  return remaining > 0 ? remaining : 0;
}

export type RenewalValidation =
  | { ok: true; day: RenewalDay }
  | { ok: false; error: string };

export function validateRenewal(input: {
  startDate: string;
  validityDays: number;
  date: unknown;
  today: string;
  status: unknown;
  time?: unknown;
  signedById?: string | null;
  signedByName?: string | null;
  signatureData?: string | null;
  existing?: RenewalDay | null;
  amendReason?: unknown;
}): RenewalValidation {
  const { startDate, validityDays, today } = input;

  if (!isDateString(input.date)) {
    return { ok: false, error: "Pick a valid day to renew." };
  }
  const date = input.date;

  if (!isWithinWindow(startDate, validityDays, date)) {
    return {
      ok: false,
      error: `${date} falls outside this permit's validity period (${startDate} to ${expiryDateOf(startDate, validityDays)}).`,
    };
  }

  // A renewal is signed on the day, in front of the work. Signing tomorrow's
  // column today is authorising work nobody has seen the conditions for.
  if (date > today) {
    return { ok: false, error: "A day cannot be renewed before it arrives." };
  }

  const status = input.status === "WORKED" || input.status === "NOT_WORKED" ? input.status : null;
  if (!status) {
    return { ok: false, error: "Mark the day as worked or not worked." };
  }

  const amendReason = String(input.amendReason ?? "").trim();
  if (input.existing) {
    if (amendReason.length < 10) {
      return {
        ok: false,
        error:
          `${date} is already recorded on this permit. Changing a signed renewal has to be justified, ` +
          `give the reason for the correction (at least a sentence).`,
      };
    }
  }

  let time: string | null = null;
  if (status === "WORKED") {
    const raw = String(input.time ?? "").trim();
    if (!TIME_RE.test(raw)) {
      return { ok: false, error: "Enter the time work started on that day, as HH:MM." };
    }
    time = raw;
    if (!input.signatureData) {
      return { ok: false, error: "The Asset Holder Supervisor must sign the day's renewal." };
    }
  }

  return {
    ok: true,
    day: {
      date,
      status,
      time,
      signedById: input.signedById ?? null,
      signedByName: input.signedByName ?? null,
      signatureData: status === "WORKED" ? (input.signatureData ?? null) : null,
      amendedFrom: input.existing
        ? `${input.existing.status}${input.existing.time ? ` ${input.existing.time}` : ""} by ${input.existing.signedByName ?? "unknown"}, ${amendReason}`
        : null,
      markedAt: null,
    },
  };
}

export type RenewalSummary = {
  expiresOn: string;
  daysRemaining: number;
  expired: boolean;
  total: number;
  worked: number;
  notWorked: number;
  unmarked: number;
  // Days that have already passed with nothing recorded against them. An
  // unmarked day in the past is a gap in the evidence, not a day off.
  unaccounted: string[];
};

export function renewalSummary(
  startDate: string,
  validityDays: number,
  marks: RenewalMarks | null | undefined,
  today: string,
): RenewalSummary {
  const days = permitDays(startDate, validityDays);
  const m = marks ?? {};
  let worked = 0;
  let notWorked = 0;
  const unaccounted: string[] = [];

  for (const day of days) {
    const mark = m[day];
    if (mark?.status === "WORKED") worked++;
    else if (mark?.status === "NOT_WORKED") notWorked++;
    else if (day <= today) unaccounted.push(day);
  }

  return {
    expiresOn: expiryDateOf(startDate, validityDays),
    daysRemaining: daysRemaining(startDate, validityDays, today),
    expired: isExpiredOn(startDate, validityDays, today),
    total: days.length,
    worked,
    notWorked,
    unmarked: days.length - worked - notWorked,
    unaccounted,
  };
}

export type ExpiryAction =
  | { action: "NONE" }
  | { action: "WARN"; daysLeft: number }
  | { action: "CLOSE_COMPLETE" }
  | { action: "CLOSE_WORK_ONGOING" };

// What the nightly reconciliation should do with a permit today. Warning starts
// two days out because a successor needs the full signature chain before work can
// resume, and that cannot be collected on the morning it is needed.
export function expiryDecision(input: {
  startDate: string;
  validityDays: number;
  today: string;
  status: string;
  workComplete: boolean;
  warnWithinDays?: number;
}): ExpiryAction {
  const { startDate, validityDays, today, status, workComplete } = input;
  if (status !== "ACTIVE" && status !== "PENDING_APPROVAL") return { action: "NONE" };

  if (isExpiredOn(startDate, validityDays, today)) {
    return workComplete ? { action: "CLOSE_COMPLETE" } : { action: "CLOSE_WORK_ONGOING" };
  }

  const left = daysRemaining(startDate, validityDays, today);
  const warnWithin = input.warnWithinDays ?? 2;
  if (status === "ACTIVE" && !workComplete && left <= warnWithin) {
    return { action: "WARN", daysLeft: left };
  }
  return { action: "NONE" };
}

// Text for the closure line on an expired permit. The reason belongs on the
// record, not in a status code an auditor has to interpret.
export function workOngoingClosureNote(summary: RenewalSummary, successorNumber?: string): string {
  const base =
    `Validity period elapsed on ${summary.expiresOn} with the work incomplete. ` +
    `${summary.worked} of ${summary.total} days worked, ${summary.notWorked} not worked. ` +
    `Permit closed as work ongoing.`;
  return successorNumber ? `${base} Continued under ${successorNumber}.` : base;
}
