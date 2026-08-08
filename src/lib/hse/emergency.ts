// src/lib/hse/emergency.ts
// Emergency preparedness — ISO 45001 clause 8.2.
//
// The register exists to stop one specific sentence being true: "we have forty
// fire extinguishers." An extinguisher that is present but discharged, expired,
// or last inspected three years ago is not a fire extinguisher; it is a red
// cylinder that people will reach for and find useless. So a headcount is not
// the number this register reports — readiness is, and an item is ready only
// when it is serviceable, in date, AND inspected within its interval.
//
// The same applies to drills: a drill programme measured by "we did one" says
// nothing. What an auditor asks is whether they happen at the required
// frequency, and whether the deficiencies they surfaced were closed.

export type EmergencyEquipmentType =
  | "FIRE_EXTINGUISHER"
  | "FIRE_ALARM"
  | "FIRE_HOSE"
  | "EMERGENCY_LIGHT"
  | "EXIT_SIGN"
  | "FIRST_AID_KIT"
  | "EYE_WASH"
  | "SAFETY_SHOWER"
  | "SPILL_KIT"
  | "AED"
  | "ASSEMBLY_POINT"
  | "OTHER";

export const EMERGENCY_TYPE_LABELS: Record<EmergencyEquipmentType, string> = {
  FIRE_EXTINGUISHER: "Fire extinguisher",
  FIRE_ALARM: "Fire alarm / call point",
  FIRE_HOSE: "Fire hose reel",
  EMERGENCY_LIGHT: "Emergency light",
  EXIT_SIGN: "Exit sign",
  FIRST_AID_KIT: "First aid kit",
  EYE_WASH: "Eye wash station",
  SAFETY_SHOWER: "Safety shower",
  SPILL_KIT: "Spill kit",
  AED: "Defibrillator (AED)",
  ASSEMBLY_POINT: "Assembly point",
  OTHER: "Other",
};

// Sensible statutory-ish defaults; every item can override its own interval.
export const DEFAULT_INSPECTION_INTERVAL_DAYS: Record<string, number> = {
  FIRE_EXTINGUISHER: 30,
  FIRE_ALARM: 30,
  FIRE_HOSE: 90,
  EMERGENCY_LIGHT: 30,
  EXIT_SIGN: 90,
  FIRST_AID_KIT: 30,
  EYE_WASH: 7,
  SAFETY_SHOWER: 7,
  SPILL_KIT: 90,
  AED: 30,
  ASSEMBLY_POINT: 180,
  OTHER: 90,
};

export const intervalFor = (type: string | null | undefined): number =>
  DEFAULT_INSPECTION_INTERVAL_DAYS[(type ?? "").toUpperCase().trim()] ?? 90;

export type ServiceState = "SERVICEABLE" | "DEFECTIVE" | "MISSING" | "REMOVED";

// The single question the register answers about one item.
export type Readiness = {
  ready: boolean;
  severity: "ok" | "warn" | "fail";
  // Every reason it is not ready, not just the first one found — an item can be
  // both expired and overdue, and fixing one leaves it unusable.
  reasons: string[];
  inspection: "OK" | "DUE_SOON" | "OVERDUE" | "NEVER_INSPECTED";
  expiry: "OK" | "EXPIRING_SOON" | "EXPIRED" | "NONE";
  daysUntilInspection: number | null;
  daysUntilExpiry: number | null;
};

const DAY = 86_400_000;
const EXPIRY_WARN_DAYS = 30;
const INSPECTION_WARN_FRACTION = 0.8;

function daysBetween(fromISO: string, toISO: string): number | null {
  const a = Date.parse(`${fromISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${toISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / DAY);
}

export function assessReadiness(
  item: {
    status?: string | null;
    type?: string | null;
    lastInspectionDate?: string | null;
    inspectionIntervalDays?: number | null;
    expiryDate?: string | null;
  },
  todayISO: string = new Date().toISOString().slice(0, 10),
): Readiness {
  const reasons: string[] = [];
  const status = (item.status ?? "SERVICEABLE").toUpperCase().trim();

  // ── Inspection ────────────────────────────────────────────────────────────
  const interval =
    item.inspectionIntervalDays && item.inspectionIntervalDays > 0
      ? item.inspectionIntervalDays
      : intervalFor(item.type);

  let inspection: Readiness["inspection"] = "NEVER_INSPECTED";
  let daysUntilInspection: number | null = null;

  if (item.lastInspectionDate) {
    const since = daysBetween(item.lastInspectionDate, todayISO);
    if (since === null) {
      inspection = "NEVER_INSPECTED";
    } else {
      daysUntilInspection = interval - since;
      inspection =
        daysUntilInspection < 0
          ? "OVERDUE"
          : since >= interval * INSPECTION_WARN_FRACTION
            ? "DUE_SOON"
            : "OK";
    }
  }

  if (inspection === "NEVER_INSPECTED") {
    reasons.push("Never inspected — there is no evidence it works.");
  } else if (inspection === "OVERDUE") {
    reasons.push(`Inspection overdue by ${Math.abs(daysUntilInspection ?? 0)} day(s).`);
  }

  // ── Expiry / service life ─────────────────────────────────────────────────
  let expiry: Readiness["expiry"] = "NONE";
  let daysUntilExpiry: number | null = null;

  if (item.expiryDate) {
    const left = daysBetween(todayISO, item.expiryDate);
    if (left !== null) {
      daysUntilExpiry = left;
      expiry = left < 0 ? "EXPIRED" : left <= EXPIRY_WARN_DAYS ? "EXPIRING_SOON" : "OK";
    }
  }
  if (expiry === "EXPIRED") {
    reasons.push(`Expired ${Math.abs(daysUntilExpiry ?? 0)} day(s) ago — it must not be relied on.`);
  }

  // ── Physical state ────────────────────────────────────────────────────────
  if (status === "DEFECTIVE") reasons.push("Recorded as defective.");
  if (status === "MISSING") reasons.push("Missing from its location.");

  // A removed item is out of service on purpose. It is not a failure, and
  // counting it as one would push people to delete records instead of retiring
  // them — losing the history an auditor asks for.
  if (status === "REMOVED") {
    return {
      ready: false,
      severity: "ok",
      reasons: ["Withdrawn from service."],
      inspection,
      expiry,
      daysUntilInspection,
      daysUntilExpiry,
    };
  }

  const ready = reasons.length === 0;
  const severity: Readiness["severity"] = ready
    ? inspection === "DUE_SOON" || expiry === "EXPIRING_SOON"
      ? "warn"
      : "ok"
    : "fail";

  return { ready, severity, reasons, inspection, expiry, daysUntilInspection, daysUntilExpiry };
}

// The headline. "40 extinguishers" is not the number; "31 of 40 ready" is.
export function readinessSummary(
  items: {
    status?: string | null;
    type?: string | null;
    lastInspectionDate?: string | null;
    inspectionIntervalDays?: number | null;
    expiryDate?: string | null;
  }[],
  todayISO: string = new Date().toISOString().slice(0, 10),
): { total: number; inService: number; ready: number; notReady: number; dueSoon: number; percent: number | null } {
  let inService = 0;
  let ready = 0;
  let dueSoon = 0;

  for (const item of items) {
    if ((item.status ?? "").toUpperCase().trim() === "REMOVED") continue;
    inService++;
    const r = assessReadiness(item, todayISO);
    if (r.ready) ready++;
    if (r.severity === "warn") dueSoon++;
  }

  return {
    total: items.length,
    inService,
    ready,
    notReady: inService - ready,
    dueSoon,
    percent: inService > 0 ? Math.round((ready / inService) * 100) : null,
  };
}

// ── Drills ───────────────────────────────────────────────────────────────────

export type DrillType = "FIRE_EVACUATION" | "SPILL_RESPONSE" | "FIRST_AID" | "RESCUE" | "OTHER";

export const DRILL_TYPE_LABELS: Record<DrillType, string> = {
  FIRE_EVACUATION: "Fire evacuation",
  SPILL_RESPONSE: "Chemical / spill response",
  FIRST_AID: "First aid / casualty",
  RESCUE: "Rescue (confined space, working at height)",
  OTHER: "Other",
};

// ISO 45001 8.2 requires drills to be *periodic*, so a programme is judged on
// interval, not on whether one ever happened.
export function drillProgrammeStatus(
  drills: { drillDate: string; drillType: string }[],
  requiredIntervalDays = 365,
  todayISO: string = new Date().toISOString().slice(0, 10),
): {
  lastDrillDate: string | null;
  daysSince: number | null;
  status: "OK" | "DUE_SOON" | "OVERDUE" | "NEVER";
  nextDueDate: string | null;
} {
  const valid = drills
    .filter((d) => !Number.isNaN(Date.parse(`${d.drillDate.slice(0, 10)}T00:00:00Z`)))
    .sort((a, b) => b.drillDate.localeCompare(a.drillDate));

  if (!valid.length) {
    return { lastDrillDate: null, daysSince: null, status: "NEVER", nextDueDate: null };
  }

  const last = valid[0].drillDate.slice(0, 10);
  const daysSince = daysBetween(last, todayISO) ?? 0;
  const nextDue = new Date(Date.parse(`${last}T00:00:00Z`) + requiredIntervalDays * DAY)
    .toISOString()
    .slice(0, 10);

  const status =
    daysSince > requiredIntervalDays
      ? "OVERDUE"
      : daysSince >= requiredIntervalDays * INSPECTION_WARN_FRACTION
        ? "DUE_SOON"
        : "OK";

  return { lastDrillDate: last, daysSince, status, nextDueDate: nextDue };
}

// A drill that surfaced problems and closed none of them is a drill that taught
// the organisation nothing — which is precisely what an auditor probes.
export function drillFollowUp(drills: { deficiencies?: string | null; correctiveActions?: string | null }[]): {
  withDeficiencies: number;
  unresolved: number;
} {
  let withDeficiencies = 0;
  let unresolved = 0;
  for (const d of drills) {
    const found = (d.deficiencies ?? "").trim().length > 0;
    if (!found) continue;
    withDeficiencies++;
    if ((d.correctiveActions ?? "").trim().length === 0) unresolved++;
  }
  return { withDeficiencies, unresolved };
}
