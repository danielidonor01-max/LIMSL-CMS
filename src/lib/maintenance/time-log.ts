// src/lib/maintenance/time-log.ts
// Hours actually spent on a job, as opposed to hours somebody typed in.
//
// Until now `actualDuration` was a number entered at close-out, from memory,
// days after the work. It is the input to mean time to repair, which is a
// headline reliability figure, and it was the one number in the system with no
// evidence behind it at all.
//
// So: a technician clocks on when they start and off when they stop, as many
// times as the job takes. Each stretch is its own row and is never overwritten,
// for the same reason each inspection is its own row — a total that can be
// edited is not evidence of anything.
//
// Elapsed time is deliberately NOT the same thing. A job started on Friday
// afternoon and finished on Monday morning is seventy-two hours elapsed and
// perhaps six hours of work. Mean time to repair wants the six.
//
// No database here: this decides, and the route and the page do as they are told.

export interface TimeSession {
  id: string;
  userId: string | null;
  userName: string | null;
  startedAt: string;
  endedAt: string | null;
}

const HOUR = 3_600_000;

// Timestamps are stored as ISO text. Anything that does not parse returns null
// rather than a number: a date that fails to parse used to become a duration of
// several thousand days, which looks like data and is not.
function msBetween(startISO: string, endISO: string): number | null {
  const a = Date.parse(startISO);
  const b = Date.parse(endISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return b - a;
}

/** Hours in one stretch, or null when it is unparseable or ends before it starts. */
export function sessionHours(session: TimeSession): number | null {
  if (!session.endedAt) return null;
  const ms = msBetween(session.startedAt, session.endedAt);
  if (ms === null) return null;
  // A stretch that ends before it began is a clock problem, not a negative
  // amount of work. Counting it would quietly reduce the total.
  if (ms < 0) return null;
  return ms / HOUR;
}

/**
 * Total hours booked to a job, counting only stretches that have been closed.
 *
 * A running clock is excluded on purpose: the total is what the job HAS cost,
 * and a figure that climbs while nobody is looking cannot be signed for.
 */
export function totalLoggedHours(sessions: TimeSession[]): number {
  const total = sessions.reduce((sum, s) => sum + (sessionHours(s) ?? 0), 0);
  // Two decimals. Minutes matter on a two-hour job; seconds never do, and a
  // raw float renders as 1.7000000000000002.
  return Math.round(total * 100) / 100;
}

/** The stretch this person currently has running on this job, if any. */
export function openSessionFor(sessions: TimeSession[], userId: string): TimeSession | null {
  return sessions.find((s) => s.userId === userId && !s.endedAt) ?? null;
}

/** Everyone currently clocked on, in the order they started. */
export function runningSessions(sessions: TimeSession[]): TimeSession[] {
  return sessions
    .filter((s) => !s.endedAt)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export type ClockDecision = { ok: true } | { ok: false; error: string };

/**
 * Whether this person may clock on.
 *
 * Several people on one job at once is normal — a lead and two assistants — so
 * only the same person twice is refused. That happens when somebody forgets to
 * clock off and presses the button again the next morning, and allowing it
 * would leave the first stretch running forever and the total meaningless.
 */
export function canClockIn(sessions: TimeSession[], userId: string): ClockDecision {
  const open = openSessionFor(sessions, userId);
  if (open) {
    return {
      ok: false,
      error:
        "You are already clocked on to this job. Clock off first, then on again if you are starting a fresh stretch.",
    };
  }
  return { ok: true };
}

/** Whether this person may clock off. */
export function canClockOff(sessions: TimeSession[], userId: string): ClockDecision {
  if (!openSessionFor(sessions, userId)) {
    return { ok: false, error: "You are not clocked on to this job." };
  }
  return { ok: true };
}

/** Hours per person, worst-first by hours, for the record and for costing later. */
export function hoursByPerson(
  sessions: TimeSession[],
): { userId: string | null; userName: string; hours: number }[] {
  const byPerson = new Map<string, { userId: string | null; userName: string; hours: number }>();
  for (const s of sessions) {
    const hours = sessionHours(s);
    if (hours === null) continue;
    // Keyed by id where there is one. Two people can share a name; nobody
    // shares an id, and merging them would attribute one person's hours to
    // another on a record that may end up in a costing.
    const key = s.userId ?? `name:${s.userName ?? "Unknown"}`;
    const existing = byPerson.get(key);
    if (existing) existing.hours += hours;
    else byPerson.set(key, { userId: s.userId, userName: s.userName ?? "Unknown", hours });
  }
  return [...byPerson.values()]
    .map((p) => ({ ...p, hours: Math.round(p.hours * 100) / 100 }))
    .sort((a, b) => b.hours - a.hours);
}

/** How a duration reads on screen: "3h 20m", "45m", "2h". */
export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours) || hours < 0) return "—";
  const totalMinutes = Math.round(hours * 60);
  if (totalMinutes === 0) return "0m";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
