// src/lib/earthing/earthing.ts
// The arithmetic of the Earthing module, pure so the API, the entry form's live
// preview and the tests cannot disagree about what a reading means.
//
// LIMSL test their earth pits by the fall-of-potential method with a Habotest
// HT20302 (LIMSL, 17 Nov 2026). The current spike C goes out a distance D from
// the electrode under test; the potential probe P is driven at 62% of D, where
// the electrode's and the current spike's resistance areas do not overlap, and
// the reading there is the electrode's resistance. Two more readings, with P at
// 52% and 72% of D, are the check that 62% really was outside both areas: if
// they agree with it within ±5% the curve is flat there and the result stands.
// If they do not, the spikes are too close together, and the honest thing is to
// say so on the record rather than refuse it: the reading is still evidence,
// and the next test knows to move the current spike further out.
import { DEFAULT_CATEGORY_FREQUENCIES } from "@/lib/constants";

export const EARTHING_SETUP_MESSAGE =
  "The Earthing module needs a one-off database step before it can be used: run src/lib/db/apply-earthing.ts.";

// 5 Ω is the figure commonly asked of a general installation earth electrode
// (and the usual in-house target in Nigerian practice); a lightning-protection
// pit or an electronics clean earth is often held to 1 Ω or less. So it is a
// starting value, not a rule: each pit carries its own limit and the verdict
// is judged against the limit as it stood on the day of the test.
export const DEFAULT_LIMIT_OHMS = 5;

export const METHOD_FALL_OF_POTENTIAL = "FALL_OF_POTENTIAL";
export const PROBE_POSITIONS = [52, 62, 72] as const;
export const CONSISTENCY_TOLERANCE_PCT = 5;

// Earthing is tested annually (DEFAULT_CATEGORY_FREQUENCIES.EARTHING); due
// soon follows the calibration register's 30-day window so the two read alike.
export const EARTHING_FREQUENCY = DEFAULT_CATEGORY_FREQUENCIES.EARTHING ?? "ANNUAL";
const FREQUENCY_DAYS: Record<string, number> = {
  MONTHLY: 30,
  BI_MONTHLY: 61,
  QUARTERLY: 91,
  SEMI_ANNUAL: 182,
  ANNUAL: 365,
};
export const EARTHING_INTERVAL_DAYS = FREQUENCY_DAYS[EARTHING_FREQUENCY] ?? 365;
export const DUE_SOON_DAYS = 30;

export const ELECTRODE_TYPES = ["ROD", "PLATE", "STRIP", "MESH", "OTHER"] as const;
export type ElectrodeType = (typeof ELECTRODE_TYPES)[number];
export const ELECTRODE_LABELS: Record<ElectrodeType, string> = {
  ROD: "Rod",
  PLATE: "Plate",
  STRIP: "Strip / tape",
  MESH: "Mesh / grid",
  OTHER: "Other",
};

export const SOIL_CONDITIONS = ["DRY", "MOIST", "WET"] as const;
export type SoilCondition = (typeof SOIL_CONDITIONS)[number];
export const SOIL_LABELS: Record<SoilCondition, string> = { DRY: "Dry", MOIST: "Moist", WET: "Wet" };

export type Verdict = "PASS" | "FAIL";

// Which calibration-register rows are earth testers. Matched on the record's
// own words, because the register has no instrument-type column.
export const EARTH_INSTRUMENT_PATTERN = /earth|habotest|HT20302/i;

export function isEarthInstrument(rec: {
  instrumentName?: string | null;
  make?: string | null;
  model?: string | null;
}): boolean {
  return [rec.instrumentName, rec.make, rec.model].some((v) => !!v && EARTH_INSTRUMENT_PATTERN.test(v));
}

/** "HABOTEST HT20302 · S/N H12D-J051012", the instrument as it is identified on a test record. */
export function instrumentLabel(rec: {
  instrumentName?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
}): string {
  const head = [rec.make, rec.model].filter((v) => v && v.trim()).join(" ").trim() || (rec.instrumentName ?? "").trim();
  return rec.serialNumber ? `${head || "Instrument"} · S/N ${rec.serialNumber}` : head || "Instrument";
}

// A reading taken with an instrument that was not in calibration on the day is
// not traceable (ISO 9001 7.1.5.2). It is still kept, marked, never hidden.
export const UNTRUSTED_CAL_STATES = ["OVERDUE", "NOT_CALIBRATED", "OUT_OF_SERVICE"] as const;

export function calibrationWarning(status: string | null | undefined): string | null {
  switch (status) {
    case "OVERDUE":
      return "The instrument was out of calibration on the test date. The reading is recorded, but it is not traceable until the instrument is recalibrated.";
    case "NOT_CALIBRATED":
      return "No calibration is on record for this instrument. The reading is recorded, but it is not traceable.";
    case "OUT_OF_SERVICE":
      return "The instrument is out of service after a failed calibration. The reading is recorded, but it should not be relied on.";
    default:
      return null;
  }
}

const round = (n: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

/** Where the potential probe goes for a current-spike distance D, in metres. */
export function probePositions(currentProbeDistanceM: number | null | undefined): { positionPct: number; distanceM: number | null }[] {
  const d = Number(currentProbeDistanceM);
  const ok = Number.isFinite(d) && d > 0;
  return PROBE_POSITIONS.map((p) => ({ positionPct: p, distanceM: ok ? round((d * p) / 100, 2) : null }));
}

export type Reading = { positionPct: number; distanceM: number | null; ohms: number };

export type EvaluateInput = {
  currentProbeDistanceM?: number | string | null;
  r52?: number | string | null;
  r62: number | string | null | undefined;
  r72?: number | string | null;
  limitOhms: number | string | null | undefined;
  /** Only the 62% reading was taken. Allowed; consistency is then unknown, not assumed. */
  singleReading?: boolean;
};

export type Evaluation = {
  resistanceOhms: number;
  readings: Reading[];
  currentProbeDistanceM: number | null;
  /** Largest deviation of the 52%/72% readings from the 62% reading, in %. */
  spreadPct: number | null;
  /** true within ±5%, false outside it, null for a single-reading test. */
  consistent: boolean | null;
  limitOhms: number;
  verdict: Verdict;
  /** Plain-English note for an inconsistent test; null otherwise. */
  advice: string | null;
};

export const INCONSISTENT_ADVICE =
  "The 52% and 72% readings differ from the 62% reading by more than 5%. The probes are inside the electrode's resistance area: move the current spike further out and retest.";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export function evaluateFallOfPotential(input: EvaluateInput): { ok: true; value: Evaluation } | { ok: false; error: string } {
  const r62 = num(input.r62);
  if (r62 === null) return { ok: false, error: "Enter the resistance read with the potential probe at 62%." };
  if (!Number.isFinite(r62) || r62 <= 0) return { ok: false, error: "The 62% reading must be a resistance greater than 0 Ω." };

  const limit = num(input.limitOhms);
  if (limit === null || !Number.isFinite(limit) || limit <= 0) {
    return { ok: false, error: "The pit has no valid resistance limit. Set one on the pit first." };
  }

  const d = num(input.currentProbeDistanceM);
  if (d !== null && (!Number.isFinite(d) || d <= 0)) {
    return { ok: false, error: "The current-spike distance must be a positive number of metres." };
  }
  const positions = probePositions(d);
  const at = (pct: number) => positions.find((p) => p.positionPct === pct)!.distanceM;

  let readings: Reading[];
  let spreadPct: number | null = null;
  let consistent: boolean | null = null;

  if (input.singleReading) {
    readings = [{ positionPct: 62, distanceM: at(62), ohms: r62 }];
  } else {
    const r52 = num(input.r52);
    const r72 = num(input.r72);
    if (r52 === null || r72 === null) {
      return {
        ok: false,
        error: "Enter the 52% and 72% readings as well, or mark this as a test where only the 62% reading was taken.",
      };
    }
    if (!Number.isFinite(r52) || !Number.isFinite(r72) || r52 <= 0 || r72 <= 0) {
      return { ok: false, error: "Every reading must be a resistance greater than 0 Ω." };
    }
    readings = [
      { positionPct: 52, distanceM: at(52), ohms: r52 },
      { positionPct: 62, distanceM: at(62), ohms: r62 },
      { positionPct: 72, distanceM: at(72), ohms: r72 },
    ];
    spreadPct = round((Math.max(Math.abs(r52 - r62), Math.abs(r72 - r62)) / r62) * 100, 1);
    consistent = spreadPct <= CONSISTENCY_TOLERANCE_PCT;
  }

  return {
    ok: true,
    value: {
      resistanceOhms: r62,
      readings,
      currentProbeDistanceM: d,
      spreadPct,
      consistent,
      limitOhms: limit,
      verdict: r62 <= limit ? "PASS" : "FAIL",
      advice: consistent === false ? INCONSISTENT_ADVICE : null,
    },
  };
}

/** Reads the stored readings column back; a malformed one is an empty list, never a crash. */
export function parseReadings(raw: unknown): Reading[] {
  if (!raw) return [];
  try {
    const arr = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((r) => ({
        positionPct: Number(r?.positionPct),
        distanceM: r?.distanceM === null || r?.distanceM === undefined ? null : Number(r.distanceM),
        ohms: Number(r?.ohms),
      }))
      .filter((r) => Number.isFinite(r.positionPct) && Number.isFinite(r.ohms));
  } catch {
    return [];
  }
}

// ── Trends ──────────────────────────────────────────────────────────────────

export type TestPoint = {
  pitId: string;
  testDate: string;
  testTime?: string | null;
  createdAt?: string | null;
  resistanceOhms: number;
};

const orderKey = (t: TestPoint) => `${t.testDate}|${t.testTime ?? ""}|${t.createdAt ?? ""}`;

/** Newest first. Two tests on the same day are ordered by time, then by when they were entered. */
export function newestFirst<T extends TestPoint>(tests: T[]): T[] {
  return [...tests].sort((a, b) => orderKey(b).localeCompare(orderKey(a)));
}

export function latestPerPit<T extends TestPoint>(tests: T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const t of newestFirst(tests)) if (!out.has(t.pitId)) out.set(t.pitId, t);
  return out;
}

/** Oldest first, one pit. What a trend line is drawn from. */
export function seriesForPit<T extends TestPoint>(tests: T[], pitId: string): T[] {
  return newestFirst(tests.filter((t) => t.pitId === pitId)).reverse();
}

/** The latest reading against the one before it, in %. Null with fewer than two. */
export function changeVsPrevious(series: TestPoint[]): number | null {
  const ordered = newestFirst(series);
  if (ordered.length < 2) return null;
  const [latest, previous] = ordered;
  if (!(previous.resistanceOhms > 0)) return null;
  return round(((latest.resistanceOhms - previous.resistanceOhms) / previous.resistanceOhms) * 100, 1);
}

const dayNumber = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 864e5;

/**
 * Least-squares slope of resistance against time, in Ω per year. A pit drying
 * out or an electrode corroding shows as a steady climb long before it crosses
 * the limit, which is the point of keeping a trend at all. Null until there are
 * two readings on different days.
 */
export function slopePerYear(series: TestPoint[]): number | null {
  const pts = series
    .map((t) => ({ x: dayNumber(t.testDate) / 365.25, y: t.resistanceOhms }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 2) return null;
  const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  if (sxx === 0) return null;
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  return round(sxy / sxx, 3);
}

export type DueState = "CURRENT" | "DUE_SOON" | "OVERDUE" | "NEVER";

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** When a pit is next due a test, and whether that is soon or past. */
export function dueStatus(
  lastTestDate: string | null | undefined,
  today: string,
): { state: DueState; nextDue: string | null; days: number | null } {
  if (!lastTestDate) return { state: "NEVER", nextDue: null, days: null };
  const nextDue = addDaysIso(lastTestDate, EARTHING_INTERVAL_DAYS);
  const days = Math.round(dayNumber(nextDue) - dayNumber(today));
  const state: DueState = days < 0 ? "OVERDUE" : days <= DUE_SOON_DAYS ? "DUE_SOON" : "CURRENT";
  return { state, nextDue, days };
}

// ── Validation of the records themselves ────────────────────────────────────

export const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

export const isHhMm = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export function normalisePitCode(raw: unknown): string {
  return String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "-");
}

/**
 * Where a pit stands now: its latest reading against its CURRENT limit. A test
 * keeps the verdict it was given on the day (its own snapshotted limit), but a
 * pit's status follows the limit as it is now, so correcting a limit that was
 * typed wrong is reflected straight away, without a retest.
 */
export function currentVerdict(resistanceOhms: number, limitOhms: number): Verdict {
  return resistanceOhms <= limitOhms ? "PASS" : "FAIL";
}

/**
 * The next pit number, EP-01, EP-02, … (LIMSL, 17 Nov 2026: the number is
 * generated, nobody types it). It follows the highest EP-n already used, so a
 * retired pit's number is never handed out again. Two digits, more if needed.
 */
export function nextPitCode(existing: string[]): string {
  let max = 0;
  for (const c of existing) {
    const m = /^EP-(\d+)$/.exec(c);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `EP-${String(max + 1).padStart(2, "0")}`;
}

export function validatePit(body: {
  code?: unknown;
  name?: unknown;
  limitOhms?: unknown;
  electrodeType?: unknown;
}, opts: { partial?: boolean } = {}): string | null {
  const has = (k: keyof typeof body) => body[k] !== undefined;
  // The code is generated on create (`nextPitCode`), so it is only checked
  // when one is actually given.
  if (has("code")) {
    const code = normalisePitCode(body.code);
    if (!code) return "Give the pit a code, such as EP-01. It is what is painted on the pit cover.";
    if (code.length > 20) return "Keep the pit code to 20 characters.";
  }
  if (!opts.partial || has("name")) {
    if (!String(body.name ?? "").trim()) return "Give the pit a name, such as \"Main distribution board earth\".";
  }
  if (!opts.partial || has("limitOhms")) {
    const n = Number(body.limitOhms);
    if (body.limitOhms === null || body.limitOhms === "" || !Number.isFinite(n) || n <= 0 || n > 1000) {
      return "The resistance limit must be a number of ohms greater than 0.";
    }
  }
  if (body.electrodeType !== undefined && body.electrodeType !== null && body.electrodeType !== "") {
    if (!(ELECTRODE_TYPES as readonly string[]).includes(String(body.electrodeType))) {
      return `Electrode type must be one of: ${ELECTRODE_TYPES.join(", ")}.`;
    }
  }
  return null;
}

// The legacy register carried the site earthing as a tag-less "system" row,
// which the import turned into LEE/SYS/0001. Earthing lives in its own module
// since 17 Nov 2026, so a re-import must not bring that row back.
export function isEarthingSystemRow(row: { leeTag?: string | null; name?: string | null }): boolean {
  return !String(row.leeTag ?? "").trim() && /earthing/i.test(String(row.name ?? ""));
}
