// src/lib/signoff/ping.ts
// Pinging the next signer: the rules, kept apart from the route so they can be
// tested without a database.
//
// A document stalls at whoever has not signed yet, and the people who feel it
// are the ones who already have. So the ping belongs to them: anyone with a
// signature on the chain can remind the next signer, once every half hour.
// Thirty minutes is LIMSL's rule (16 Nov 2026). Less and a reminder becomes
// noise the signer learns to ignore; the limit is per document, not per
// person, so three people on the trail cannot ping the same signer three times.
import { nextPendingStep, canSignChainStep } from "@/lib/signoff/chains";
import { isSuperAdmin } from "@/lib/roles";

export const PING_INTERVAL_MINUTES = 30;

export function pingWindow(lastPingAt: string | null | undefined, now: number = Date.now()) {
  if (!lastPingAt) return { allowed: true, nextAt: null as string | null };
  const next = Date.parse(lastPingAt) + PING_INTERVAL_MINUTES * 60_000;
  if (isNaN(next)) return { allowed: true, nextAt: null as string | null };
  return { allowed: now >= next, nextAt: now >= next ? null : new Date(next).toISOString() };
}

type ChainRow = {
  stepOrder: number;
  role: string;
  roleLabel: string;
  required: boolean | null;
  status: string;
  signerUserId?: string | null;
  signerUserName?: string | null;
  signedById?: string | null;
};

export type PingEligibility<T> =
  | { ok: true; step: T }
  | { ok: false; step: T | null; reason: string };

export function pingEligibility<T extends ChainRow>(
  actor: { id?: string | null; role?: string | null },
  entityType: string,
  chain: T[],
): PingEligibility<T> {
  const step = nextPendingStep(chain);
  if (!step) return { ok: false, step: null, reason: "Nothing on this document is waiting for a signature." };

  // The person it is waiting on signs; they do not remind themselves.
  const theirs = step.signerUserId
    ? step.signerUserId === actor.id
    : canSignChainStep(actor.role, entityType, step);
  if (theirs) return { ok: false, step, reason: "This step is waiting on you. Sign it rather than ping." };

  const onTrail = !!actor.id && chain.some((s) => s.status === "SIGNED" && s.signedById === actor.id);
  if (!onTrail && !isSuperAdmin(actor.role ?? undefined)) {
    return { ok: false, step, reason: "Only people who have signed this document can ping the next signer." };
  }
  return { ok: true, step };
}
