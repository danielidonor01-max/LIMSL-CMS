// src/lib/premob-verification.ts
// The rules behind crane pre-mobilisation and in-house verification, kept out
// of the routes so they can be tested without a database.
//
// Neither touches a machine's status (LIMSL, November 2026). A lapsed premob
// means the crane cannot go out on a project until it is redone; it does not
// mean the crane is broken, and marking it down would put a false figure into
// availability. Both are recorded on the machine's history instead.

export const PREMOB_CATEGORIES = ["CRANE"] as const;
export const VERIFICATION_CATEGORIES = ["WELDING", "CRANE"] as const;

export const isPremobEligible = (category: string | null | undefined) =>
  !!category && (PREMOB_CATEGORIES as readonly string[]).includes(category);
export const isVerificationEligible = (category: string | null | undefined) =>
  !!category && (VERIFICATION_CATEGORIES as readonly string[]).includes(category);

// Same window the calibration register uses for "due soon", so the three tabs
// of the module turn amber at the same distance from the date.
export const DUE_SOON_DAYS = 30;

export type DueState = "NONE" | "CURRENT" | "DUE_SOON" | "OVERDUE";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime()) /
      864e5,
  );
}

export function dueState(nextDue: string | null | undefined, today: string): DueState {
  if (!nextDue) return "NONE";
  const d = daysBetween(today, nextDue);
  if (d < 0) return "OVERDUE";
  if (d <= DUE_SOON_DAYS) return "DUE_SOON";
  return "CURRENT";
}

export type PremobInput = {
  premobDate?: unknown;
  vendor?: unknown;
  nextDueDate?: unknown;
  proofFileKey?: unknown;
};

export function validatePremob(input: PremobInput, today: string): string | null {
  const date = String(input.premobDate ?? "").slice(0, 10);
  const next = String(input.nextDueDate ?? "").slice(0, 10);
  if (!ISO.test(date)) return "Enter the premob date.";
  if (date > today) return "The premob date cannot be in the future; record it once it has happened.";
  if (!String(input.vendor ?? "").trim()) return "Name the vendor who carried out the premob.";
  if (!ISO.test(next)) return "Enter when the next premob falls due.";
  if (next <= date) return "The next due date must be after the premob date.";
  // The certificate is the record. Without it this is somebody's word that
  // the crane was inspected, which is what the register exists to replace.
  if (!String(input.proofFileKey ?? "").trim()) return "Attach the premob certificate or report.";
  return null;
}

export type ReferenceInstrument = {
  instrumentName: string;
  serialNumber: string | null;
  nextCalibrationDate: string | null;
  status: string | null;
};

// A verification is only as good as what it was checked against. An instrument
// that is out of service, or whose calibration had lapsed on the day, proves
// nothing about the machine, so the record is refused rather than kept with an
// asterisk nobody reads.
export function referenceError(ref: ReferenceInstrument | null | undefined, onDate: string): string | null {
  if (!ref) return "Choose the calibrated instrument the machine was checked against.";
  if (ref.status === "OUT_OF_SERVICE") {
    return `${ref.instrumentName} is out of service and cannot be used as a reference.`;
  }
  if (!ref.nextCalibrationDate) {
    return `${ref.instrumentName} has no calibration on record, so it cannot be used as a reference.`;
  }
  if (ref.nextCalibrationDate.slice(0, 10) < onDate.slice(0, 10)) {
    return `${ref.instrumentName}'s calibration had lapsed on ${onDate.slice(0, 10)} (due ${ref.nextCalibrationDate.slice(0, 10)}). Recalibrate it first.`;
  }
  return null;
}

export type Reading = { parameter: string; machine: string; reference: string; tolerance: string };

export function cleanReadings(raw: unknown): Reading[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        parameter: String(o.parameter ?? "").trim().slice(0, 120),
        machine: String(o.machine ?? "").trim().slice(0, 40),
        reference: String(o.reference ?? "").trim().slice(0, 40),
        tolerance: String(o.tolerance ?? "").trim().slice(0, 40),
      };
    })
    .filter((r) => r.parameter && (r.machine || r.reference))
    .slice(0, 20);
}

export type VerificationInput = {
  verificationDate?: unknown;
  result?: unknown;
  nextDueDate?: unknown;
  readings?: unknown;
};

export function validateVerification(input: VerificationInput, today: string): string | null {
  const date = String(input.verificationDate ?? "").slice(0, 10);
  if (!ISO.test(date)) return "Enter the verification date.";
  if (date > today) return "The verification date cannot be in the future.";
  if (input.result !== "PASS" && input.result !== "FAIL") return "Record whether the machine passed.";
  if (cleanReadings(input.readings).length === 0) {
    return "Record at least one reading: the machine's value and the reference instrument's.";
  }
  const next = String(input.nextDueDate ?? "").slice(0, 10);
  if (next && (!ISO.test(next) || next <= date)) return "The next due date must be after the verification date.";
  return null;
}
