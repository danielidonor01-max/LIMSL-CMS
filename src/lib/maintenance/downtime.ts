// src/lib/maintenance/downtime.ts
// How long a machine has been down, and when it is expected back.
//
// The dashboard said "2 machines are down" and stopped there. A two-hour
// breakdown and a two-day breakdown are different problems with different
// answers, and a plant manager cannot prioritise between them without the
// duration. The same goes the other way: production cannot be told anything
// useful without an expected restoration time.
//
// Both are phrased rather than returned as raw numbers, because "down 51 hours"
// is arithmetic somebody then has to do in their head to get to "since Tuesday".

export type DowntimeTone = "FRESH" | "HOURS" | "DAYS" | "STALE";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// "YYYY-MM-DDTHH:MM", the shape the column stores. Matched explicitly rather
// than inferred from the string's length: the first version of this appended
// ":00" to anything short enough, so the junk value "not a date" became
// "not a date:00", which Date.parse cheerfully turned into a moment in 1999 and
// reported as a machine that had been down for 9,749 days.
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function parse(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(LOCAL_DATETIME.test(value) ? `${value}:00` : value);
  return Number.isNaN(t) ? null : t;
}

/**
 * How long since the machine stopped.
 *
 * Returns null when there is no start time, which is a real state: a fault
 * reported without one is a gap in the record, not a zero-length breakdown.
 */
export function downFor(
  downStartAt: string | null | undefined,
  now: number = Date.now(),
): { hours: number; label: string; tone: DowntimeTone } | null {
  const start = parse(downStartAt);
  if (start === null) return null;

  const ms = Math.max(0, now - start);
  const hours = Math.floor(ms / HOUR);

  if (hours < 1) return { hours, label: "Down under an hour", tone: "FRESH" };
  if (hours < 24) {
    return { hours, label: `Down ${hours} hour${hours === 1 ? "" : "s"}`, tone: "HOURS" };
  }

  const days = Math.floor(ms / DAY);
  const rem = Math.floor((ms % DAY) / HOUR);
  const label =
    rem === 0
      ? `Down ${days} day${days === 1 ? "" : "s"}`
      : `Down ${days} day${days === 1 ? "" : "s"} ${rem} hour${rem === 1 ? "" : "s"}`;

  // Past three days a breakdown has stopped being an incident and become a
  // situation, and it should read differently.
  return { hours, label, tone: days >= 3 ? "STALE" : "DAYS" };
}

export type RestorationTone = "ON_TRACK" | "SOON" | "OVERDUE" | "UNKNOWN";

/**
 * When the machine is expected back, said in words.
 *
 * "No estimate" is deliberately a visible state rather than an empty string.
 * A breakdown with no estimate is the one production most needs to hear about,
 * so it must not render as blank space.
 */
export function expectedBack(
  expectedRestorationAt: string | null | undefined,
  now: number = Date.now(),
): { label: string; tone: RestorationTone } {
  const eta = parse(expectedRestorationAt);
  if (eta === null) return { label: "No estimate given", tone: "UNKNOWN" };

  const ms = eta - now;
  if (ms < 0) {
    const over = Math.floor(-ms / HOUR);
    if (over < 1) return { label: "Estimate just passed", tone: "OVERDUE" };
    if (over < 24) return { label: `Past estimate by ${over} hour${over === 1 ? "" : "s"}`, tone: "OVERDUE" };
    const days = Math.floor(-ms / DAY);
    return { label: `Past estimate by ${days} day${days === 1 ? "" : "s"}`, tone: "OVERDUE" };
  }

  const hours = Math.floor(ms / HOUR);
  if (hours < 1) return { label: "Back within the hour", tone: "SOON" };
  if (hours < 24) return { label: `Back in ${hours} hour${hours === 1 ? "" : "s"}`, tone: hours <= 4 ? "SOON" : "ON_TRACK" };
  const days = Math.floor(ms / DAY);
  return { label: `Back in ${days} day${days === 1 ? "" : "s"}`, tone: "ON_TRACK" };
}
