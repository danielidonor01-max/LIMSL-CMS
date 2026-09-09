// src/lib/date-field.ts
// Grammar and arithmetic for the branded date field.
//
// The native date input was replaced because the browser draws it differently
// on every platform and it cannot be made to match anything. The risk in
// replacing it is that custom date pickers are usually worse: they lose typing,
// they lose the keyboard, and they become unusable on a phone. So the rule for
// this one is that the calendar is an affordance, never the only way in. Every
// date can be typed, and typing accepts the forms a person in a Nigerian
// workshop would actually use.
//
// Parsing lives here, away from the DOM, because this is where date fields go
// wrong and it is the part worth testing.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= last;
}

// Accepts what a person types: 2026-09-15, 15/09/2026, 15-9-26, 15.09.2026.
// Day-first, because that is the convention here and the ambiguity has to be
// resolved one way. An unambiguous ISO string is always read as ISO.
export function parseDateInput(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (ISO.test(text)) return isIsoDate(text) ? text : null;

  const parts = text.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length !== 3) return null;
  if (parts.some((p) => !/^\d+$/.test(p))) return null;

  let [d, m, y] = parts.map(Number);
  // A four-digit first part is a year, so the user typed ISO with other
  // separators (2026.09.15) rather than a day.
  if (parts[0].length === 4) {
    [y, m, d] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
  } else if (parts[2].length === 2) {
    // A two-digit year inside a maintenance system is this century. A permit
    // dated 1926 is a typo, not history.
    y = 2000 + y;
  }

  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  // Clamp the day so 31 January plus one month is 28 February, not 3 March.
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isWithinRange(iso: string, min?: string | null, max?: string | null): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

export type GridDay = { iso: string; inMonth: boolean };

// Six rows of seven, always. A grid that changes height as you page through
// months makes the button under it move, which is how people mis-click.
export function monthGrid(year: number, month: number): GridDay[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // Monday-first: a maintenance week starts on Monday, and the schedule module
  // already reasons in working weeks.
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(start.getUTCDate() - offset);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return { iso: d.toISOString().slice(0, 10), inMonth: d.getUTCMonth() === month - 1 };
  });
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// What the field shows when it is not being typed in. ISO is kept deliberately:
// it is unambiguous, it sorts, and it is what the record stores, so what a
// person reads on screen is what an auditor reads in the export.
export function displayDate(iso: string | null | undefined): string {
  return isIsoDate(iso) ? iso : "";
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Time ───────────────────────────────────────────────────────────────────
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isTime(v: unknown): v is string {
  return typeof v === "string" && TIME.test(v);
}

// Accepts 8, 8:5, 08:05, 0805, 8.05, and 8am / 8:30 pm.
export function parseTimeInput(raw: string): string | null {
  let text = raw.trim().toLowerCase();
  if (!text) return null;

  let bump = 0;
  const pm = /p\.?m\.?$/.test(text);
  const am = /a\.?m\.?$/.test(text);
  if (pm || am) {
    text = text.replace(/[ap]\.?m\.?$/, "").trim();
  }

  let h: number;
  let m: number;
  const withSep = text.match(/^(\d{1,2})[:.h](\d{1,2})$/);
  const compact = text.match(/^(\d{3,4})$/);
  const hourOnly = text.match(/^(\d{1,2})$/);

  if (withSep) {
    h = Number(withSep[1]);
    m = Number(withSep[2]);
  } else if (compact) {
    const s = compact[1].padStart(4, "0");
    h = Number(s.slice(0, 2));
    m = Number(s.slice(2));
  } else if (hourOnly) {
    h = Number(hourOnly[1]);
    m = 0;
  } else {
    return null;
  }

  if (pm && h < 12) bump = 12;
  if (am && h === 12) h = 0;
  h += bump;

  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
