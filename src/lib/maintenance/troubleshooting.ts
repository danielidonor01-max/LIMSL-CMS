// src/lib/maintenance/troubleshooting.ts
// How a troubleshooting session ends, and the figures the module leads with.
// Pure, so the chat route, the module page and the tests read one set of rules.
//
// LIMSL, 27 Nov 2026: a session can start two ways, from an open breakdown or
// from "something's wrong with a machine". However it starts, a root cause
// that is found has to land on a breakdown record, because that record is what
// gets repaired, signed and counted. So a session ends in one of:
//
//   CAUSE_FOUND  the cause is known       -> needs a breakdown (linked, attached or raised)
//   SPECIALIST   needs outside expertise  -> needs a breakdown too: the machine is down
//   NO_FAULT     nothing wrong after all  -> needs a note saying what was checked
//   ABANDONED    stopped without an answer
//
// The cause found here is a suggestion to the breakdown record, never its
// verified root cause: the breakdown page offers it in a blank field, and the
// technician's Save is the verification.

export const OUTCOMES = {
  CAUSE_FOUND: { label: "Cause found", tone: "good" },
  SPECIALIST: { label: "Needs a specialist", tone: "warn" },
  NO_FAULT: { label: "No fault found", tone: "neutral" },
  ABANDONED: { label: "Stopped", tone: "neutral" },
} as const;
export type Outcome = keyof typeof OUTCOMES;

export const isOutcome = (v: unknown): v is Outcome => typeof v === "string" && v in OUTCOMES;

export function outcomeNeedsBreakdown(outcome: Outcome): boolean {
  return outcome === "CAUSE_FOUND" || outcome === "SPECIALIST";
}

/** The session status an outcome leaves behind. */
export function statusFor(outcome: Outcome): "RESOLVED" | "ABANDONED" {
  return outcome === "ABANDONED" ? "ABANDONED" : "RESOLVED";
}

export type CloseRequest = {
  outcome: Outcome;
  resolvedCause?: string | null;
  note?: string | null;
  /** The breakdown the session already belongs to. */
  linkedCorrectiveId?: string | null;
  /** An open breakdown on this machine to attach to. */
  attachCorrectiveId?: string | null;
  /** Raise a new breakdown from the session. */
  raiseBreakdown?: boolean;
};

/** Why this close is refused, or null when it may go ahead. */
export function closeError(r: CloseRequest): string | null {
  const cause = (r.resolvedCause ?? "").trim();
  const note = (r.note ?? "").trim();
  if (r.outcome === "CAUSE_FOUND" && cause.length < 3) return "Say what the cause turned out to be.";
  if (r.outcome === "NO_FAULT" && note.length < 5) return "Say what was checked, so the next person knows it was looked at.";
  if (r.outcome === "SPECIALIST" && note.length < 5) return "Say what is needed from the specialist.";
  if (outcomeNeedsBreakdown(r.outcome) && !r.linkedCorrectiveId && !r.attachCorrectiveId && !r.raiseBreakdown) {
    return "A fault that needs a repair goes on a breakdown record. Attach this session to an open breakdown on the machine, or raise one.";
  }
  if (r.attachCorrectiveId && r.raiseBreakdown) return "Attach to a breakdown or raise one, not both.";
  return null;
}

/** Hours from the fault being reported to its cause being found. */
export function hoursToCause(reportedAt: string | null | undefined, closedAt: string | null | undefined): number | null {
  if (!reportedAt || !closedAt) return null;
  const a = Date.parse(reportedAt.length === 10 ? `${reportedAt}T00:00:00Z` : reportedAt);
  const b = Date.parse(closedAt);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return (b - a) / 3_600_000;
}

export type SessionFacts = {
  status: string;
  outcome?: string | null;
  correctiveId?: string | null;
  closedAt?: string | null;
  updatedAt?: string | null;
  /** When the linked breakdown was reported, if there is one. */
  reportedAt?: string | null;
};

/**
 * Where an open breakdown stands as far as diagnosis goes. A cause found by a
 * session but not yet saved as the verified root cause is waiting for the
 * technician to verify it, not for somebody to diagnose it.
 */
export type DiagnosisState = "IN_PROGRESS" | "WAITING" | "TO_VERIFY" | "VERIFIED";
export function diagnosisState(
  b: { id: string; verifiedRootCause?: string | null },
  sessions: SessionFacts[],
): DiagnosisState {
  if ((b.verifiedRootCause ?? "").trim()) return "VERIFIED";
  const mine = sessions.filter((s) => s.correctiveId === b.id);
  if (mine.some((s) => s.status === "OPEN")) return "IN_PROGRESS";
  if (mine.some((s) => s.outcome === "CAUSE_FOUND")) return "TO_VERIFY";
  return "WAITING";
}

/** The module's lead figures. "Waiting for a diagnosis" is diagnosisState WAITING. */
export function troubleshootingSummary(
  sessions: SessionFacts[],
  openBreakdowns: { id: string; verifiedRootCause?: string | null }[],
  now = new Date(),
): { inProgress: number; awaitingDiagnosis: number; avgHoursToCause: number | null; causesFound90d: number } {
  const inProgress = sessions.filter((s) => s.status === "OPEN").length;
  const awaitingDiagnosis = openBreakdowns.filter((b) => diagnosisState(b, sessions) === "WAITING").length;

  const since = now.getTime() - 90 * 86_400_000;
  const found = sessions.filter((s) => s.outcome === "CAUSE_FOUND" && Date.parse(s.closedAt ?? s.updatedAt ?? "") >= since);
  const hours = found.map((s) => hoursToCause(s.reportedAt, s.closedAt ?? s.updatedAt)).filter((h): h is number => h !== null);
  return {
    inProgress,
    awaitingDiagnosis,
    avgHoursToCause: hours.length ? Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10 : null,
    causesFound90d: found.length,
  };
}
