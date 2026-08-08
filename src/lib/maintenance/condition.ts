// src/lib/maintenance/condition.ts
// Condition monitoring — readings taken to catch a failure before it happens.
//
// The reason this is the LAST thing in the plan rather than the first: a
// thermography or vibration programme only pays off if someone actually takes
// the readings on a schedule. The software cannot create that commitment, and a
// register full of one-off readings from eighteen months ago is worse than
// nothing, because it looks like a programme.
//
// So the design is deliberately small. Three things only:
//   1. a reading against a limit, so "is this bad" has an answer;
//   2. a trend, so a bearing heating up over six weeks is visible;
//   3. an honest verdict on whether the programme is being kept up at all.
//
// No FFT, no spectra, no ISO 10816 zone tables. For 33 machines that would be
// apparatus around a number nobody is taking.

export type ConditionKind = "TEMPERATURE" | "VIBRATION" | "CURRENT" | "PRESSURE" | "OIL_ANALYSIS" | "NOISE";

export const CONDITION_LABELS: Record<ConditionKind, string> = {
  TEMPERATURE: "Temperature (thermography)",
  VIBRATION: "Vibration",
  CURRENT: "Motor current",
  PRESSURE: "Pressure",
  OIL_ANALYSIS: "Oil analysis",
  NOISE: "Noise level",
};

export const CONDITION_UNITS: Record<ConditionKind, string> = {
  TEMPERATURE: "°C",
  VIBRATION: "mm/s",
  CURRENT: "A",
  PRESSURE: "bar",
  OIL_ANALYSIS: "ppm",
  NOISE: "dB",
};

export type ConditionVerdict = "NORMAL" | "ALERT" | "ALARM" | "NO_LIMIT";

export const VERDICT_LABELS: Record<ConditionVerdict, string> = {
  NORMAL: "Within limits",
  ALERT: "Above the alert level",
  ALARM: "Above the alarm level",
  NO_LIMIT: "No limit set",
};

export const VERDICT_BADGE: Record<ConditionVerdict, string> = {
  NORMAL: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  ALERT: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  ALARM: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  NO_LIMIT: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

// Two thresholds, because one is not enough to act on: alert means "watch it and
// plan", alarm means "stop and intervene". A single limit collapses those into
// the same response, which in practice means the alert is ignored.
// Number(null) is 0, so coercing an unset limit turns it into a limit of zero
// and every reading becomes an ALARM. Absence has to be checked before
// conversion, not after.
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function verdictFor(
  value: number,
  alertLimit: number | null | undefined,
  alarmLimit: number | null | undefined,
): ConditionVerdict {
  const v = num(value);
  if (v === null) return "NO_LIMIT";
  const alarm = num(alarmLimit);
  const alert = num(alertLimit);
  if (alarm === null && alert === null) return "NO_LIMIT";
  if (alarm !== null && v >= alarm) return "ALARM";
  if (alert !== null && v >= alert) return "ALERT";
  return "NORMAL";
}

export type Reading = { value: number; takenOn: string };

export type Trend = {
  direction: "RISING" | "FALLING" | "STABLE" | "UNKNOWN";
  changePerMonth: number | null;
  // Where it will cross the alarm limit if it keeps going as it is.
  projectedAlarmDate: string | null;
};

const DAY = 86_400_000;

// A bearing that runs 4 °C hotter every month is the thing worth catching, and
// it is invisible in any single reading. Needs at least three points — two can
// be noise, and calling two points a trend produces confident nonsense.
export function trendOf(
  readings: Reading[],
  alarmLimit?: number | null,
  from: Date = new Date(),
): Trend {
  const usable = readings
    .filter((r) => Number.isFinite(Number(r.value)) && !Number.isNaN(Date.parse(`${r.takenOn}T00:00:00Z`)))
    .sort((a, b) => a.takenOn.localeCompare(b.takenOn));

  if (usable.length < 3) {
    return { direction: "UNKNOWN", changePerMonth: null, projectedAlarmDate: null };
  }

  // Least-squares slope over days, which tolerates irregular reading intervals —
  // and real workshop readings are never on an even schedule.
  const t0 = Date.parse(`${usable[0].takenOn}T00:00:00Z`);
  const xs = usable.map((r) => (Date.parse(`${r.takenOn}T00:00:00Z`) - t0) / DAY);
  const ys = usable.map((r) => Number(r.value));
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const denom = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
  if (denom === 0) return { direction: "UNKNOWN", changePerMonth: null, projectedAlarmDate: null };

  const slopePerDay = xs.reduce((a, x, i) => a + (x - meanX) * (ys[i] - meanY), 0) / denom;
  const changePerMonth = Math.round(slopePerDay * 30 * 100) / 100;

  // A slope smaller than this is measurement noise, not a trend.
  const STABLE_BAND = 0.5;
  const direction: Trend["direction"] =
    Math.abs(changePerMonth) < STABLE_BAND ? "STABLE" : changePerMonth > 0 ? "RISING" : "FALLING";

  let projectedAlarmDate: string | null = null;
  const alarm = Number(alarmLimit);
  if (direction === "RISING" && Number.isFinite(alarm)) {
    const latest = ys[ys.length - 1];
    if (latest < alarm && slopePerDay > 0) {
      const days = Math.ceil((alarm - latest) / slopePerDay);
      if (Number.isFinite(days) && days > 0 && days <= 3650) {
        projectedAlarmDate = new Date(from.getTime() + days * DAY).toISOString().slice(0, 10);
      }
    }
  }

  return { direction, changePerMonth, projectedAlarmDate };
}

// Is this actually a programme, or a folder of readings someone took once?
export function programmeHealth(
  points: { lastReadingDate: string | null; intervalDays: number | null }[],
  todayISO: string = new Date().toISOString().slice(0, 10),
): { total: number; current: number; overdue: number; neverRead: number; keptUp: boolean } {
  const today = Date.parse(`${todayISO}T00:00:00Z`);
  let current = 0;
  let overdue = 0;
  let neverRead = 0;

  for (const p of points) {
    if (!p.lastReadingDate) {
      neverRead++;
      continue;
    }
    const last = Date.parse(`${p.lastReadingDate.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(last)) {
      neverRead++;
      continue;
    }
    const days = Math.round((today - last) / DAY);
    const interval = p.intervalDays && p.intervalDays > 0 ? p.intervalDays : 90;
    if (days > interval) overdue++;
    else current++;
  }

  return {
    total: points.length,
    current,
    overdue,
    neverRead,
    // Said plainly, because a condition-monitoring register that is mostly
    // overdue is not a predictive programme — it is a list, and reporting it as
    // a capability would be the flattering lie this codebase keeps refusing.
    keptUp: points.length > 0 && overdue + neverRead === 0,
  };
}
