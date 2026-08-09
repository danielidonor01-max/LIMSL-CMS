// src/lib/maintenance/escalation-policy.ts
// How often the system chases people, and how hard.
//
// The problem this replaces: the digest reported STATE — "5 machines are down" —
// which is true today, tomorrow and next Friday. Day one it is information. Day
// five it is wallpaper. Day ten it is filtered to a folder, and the day a SIXTH
// machine goes down nobody notices. An alert that repeats unchanged is training
// people to ignore it.
//
// Four ideas, in the order they matter:
//   1. Send on CHANGE, not on state. Nothing new since last time → send nothing.
//   2. Escalate by AGE, not by repetition. Same item, widening audience.
//   3. Let someone say "handled, waiting on a part" and stop being told.
//   4. Only then, frequency and send window — tuning a signal that already
//      means something, rather than muting one that does not.
//
// Everything here is pure so the policy can be trusted without a database.

export type EscalationTier = {
  /** Notify this tier once an item has been outstanding this many days. */
  afterDays: number;
  roles: string[];
};

export type EscalationPolicy = {
  /** Widening audience as an item ages. Kept sorted by afterDays ascending. */
  tiers: EscalationTier[];
  /** Minimum days between digests to the same person. 1 = daily. */
  frequencyDays: number;
  /** Hour of day (0–23, server time) the digest should go out. */
  sendHour: number;
  /** Skip Saturday and Sunday — a workshop that does not run at the weekend. */
  skipWeekends: boolean;
  /** Send even when nothing has changed. Off by default, and the whole point. */
  repeatUnchanged: boolean;
};

export const DEFAULT_ESCALATION_POLICY: EscalationPolicy = {
  tiers: [
    { afterDays: 0, roles: ["FOREMAN"] },
    { afterDays: 3, roles: ["MAINTENANCE_MANAGER"] },
    { afterDays: 7, roles: ["FACTORY_MANAGER"] },
    { afterDays: 14, roles: ["COO"] },
  ],
  frequencyDays: 1,
  sendHour: 7,
  skipWeekends: true,
  repeatUnchanged: false,
};

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

// Anything stored as JSON has to survive being hand-edited or half-written.
export function normalisePolicy(raw: unknown): EscalationPolicy {
  const p = (raw ?? {}) as Partial<EscalationPolicy>;
  const tiers = Array.isArray(p.tiers) ? p.tiers : DEFAULT_ESCALATION_POLICY.tiers;

  const cleaned = tiers
    .filter((t) => t && Array.isArray(t.roles) && t.roles.length > 0)
    .map((t) => ({ afterDays: clampInt(t.afterDays, 0, 365, 0), roles: [...new Set(t.roles)] }))
    .sort((a, b) => a.afterDays - b.afterDays);

  return {
    // A policy with no tiers would silently notify nobody, which looks exactly
    // like a working system that has nothing to report.
    tiers: cleaned.length ? cleaned : DEFAULT_ESCALATION_POLICY.tiers,
    frequencyDays: clampInt(p.frequencyDays, 1, 30, DEFAULT_ESCALATION_POLICY.frequencyDays),
    sendHour: clampInt(p.sendHour, 0, 23, DEFAULT_ESCALATION_POLICY.sendHour),
    skipWeekends: p.skipWeekends ?? DEFAULT_ESCALATION_POLICY.skipWeekends,
    repeatUnchanged: p.repeatUnchanged ?? DEFAULT_ESCALATION_POLICY.repeatUnchanged,
  };
}

// Every role that should hear about an item of this age. Cumulative: reaching
// day 7 does not hand the problem over, it adds the Factory Manager to the
// people already on it.
export function audienceForAge(ageDays: number, policy: EscalationPolicy): string[] {
  // A corrupt or negative age must still reach the first tier. Returning an
  // empty audience would make a broken date look identical to a healthy system
  // with nothing to report — failing closed here loses the item entirely.
  const age = Number.isFinite(ageDays) ? Math.max(0, ageDays) : 0;
  const roles = policy.tiers.filter((t) => age >= t.afterDays).flatMap((t) => t.roles);
  return [...new Set(roles)];
}

// The tier an item has just crossed, if any — used to say "this has now been
// escalated to the Factory Manager" rather than repeating the same line.
export function tierCrossed(
  previousAgeDays: number,
  currentAgeDays: number,
  policy: EscalationPolicy,
): EscalationTier | null {
  const crossed = policy.tiers.filter((t) => previousAgeDays < t.afterDays && currentAgeDays >= t.afterDays);
  return crossed.length ? crossed[crossed.length - 1] : null;
}

// ── What changed ─────────────────────────────────────────────────────────────
// A digest is worth sending when the SET has moved. Comparing keys, not counts:
// one machine fixed and another breaking leaves the count identical and the
// situation completely different.
export type DigestDiff = {
  added: string[];
  resolved: string[];
  unchanged: string[];
  changed: boolean;
};

export function diffDigest(previousKeys: string[] | null | undefined, currentKeys: string[]): DigestDiff {
  const prev = new Set(previousKeys ?? []);
  const curr = new Set(currentKeys);
  const added = currentKeys.filter((k) => !prev.has(k));
  const resolved = [...prev].filter((k) => !curr.has(k));
  const unchanged = currentKeys.filter((k) => prev.has(k));
  return { added, resolved, unchanged, changed: added.length > 0 || resolved.length > 0 };
}

// ── When to send ─────────────────────────────────────────────────────────────
export type SendDecision = { send: true } | { send: false; reason: string };

export function shouldSendDigest(input: {
  policy: EscalationPolicy;
  lastSentAt: string | null | undefined;
  diff: DigestDiff;
  currentCount: number;
  now?: Date;
  /**
   * "scheduled" is a cron tick and honours the send window; "manual" is someone
   * pressing Run now and must always work — a button that silently does nothing
   * outside 07:00 is indistinguishable from a broken button.
   */
  trigger?: "manual" | "scheduled";
}): SendDecision {
  const { policy, lastSentAt, diff, currentCount } = input;
  const now = input.now ?? new Date();
  const trigger = input.trigger ?? "manual";

  // Nothing outstanding and nothing resolved since last time: silence.
  if (currentCount === 0 && diff.resolved.length === 0) {
    return { send: false, reason: "Nothing outstanding." };
  }

  if (policy.skipWeekends) {
    const day = now.getDay();
    if (day === 0 || day === 6) return { send: false, reason: "Weekend — digests are paused." };
  }

  // The send window. A digest before shift is useful; the same digest arriving
  // through the day is not. Only applies to scheduled runs.
  if (trigger === "scheduled" && now.getHours() !== policy.sendHour) {
    return { send: false, reason: `Outside the send window (${policy.sendHour}:00).` };
  }

  if (lastSentAt) {
    const since = (now.getTime() - Date.parse(lastSentAt)) / 86_400_000;
    if (Number.isFinite(since) && since < policy.frequencyDays) {
      // A NEW item overrides the frequency floor. Sitting on a fresh breakdown
      // because a digest went out this morning is the opposite of escalation.
      if (diff.added.length === 0) {
        return { send: false, reason: `Sent ${Math.floor(since)} day(s) ago; nothing new since.` };
      }
    }
  }

  if (!policy.repeatUnchanged && !diff.changed && lastSentAt) {
    return { send: false, reason: "Nothing has changed since the last digest." };
  }

  return { send: true };
}

// ── Snooze ───────────────────────────────────────────────────────────────────
// "Handled, waiting on a part" is not the same as ignored, and a system that
// cannot tell them apart nags the person who is already dealing with it.
export type Snooze = { until: string; reason: string | null };

export function isSnoozed(snooze: Snooze | null | undefined, now: Date = new Date()): boolean {
  if (!snooze?.until) return false;
  const until = Date.parse(snooze.until);
  return Number.isFinite(until) && until > now.getTime();
}

export const MIN_SNOOZE_REASON_CHARS = 8;

export function validateSnooze(
  reason: unknown,
  until: unknown,
  todayISO: string = new Date().toISOString().slice(0, 10),
): { ok: true; reason: string; until: string } | { ok: false; error: string } {
  const text = String(reason ?? "").trim();
  const date = String(until ?? "").slice(0, 10);
  if (text.length < MIN_SNOOZE_REASON_CHARS) {
    return { ok: false, error: "Say what is being done about it — silence with no reason is just ignoring it." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= todayISO) {
    return { ok: false, error: "Set a date in the future to be reminded again." };
  }
  return { ok: true, reason: text.slice(0, 300), until: date };
}
