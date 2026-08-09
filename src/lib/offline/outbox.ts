// src/lib/offline/outbox.ts
// A submit that survives losing signal.
//
// Phase 3 shipped drafts and an honest offline banner, so nothing typed is lost
//, but a technician who presses Submit with no bars still watches it fail and
// has to remember to come back. The outbox closes that: the request is parked on
// the device and sent when the connection returns.
//
// The dangerous version of this feature is the one that swallows failures. If a
// queued request is rejected for a real reason, a validation error, a permit
// that lapsed while the phone was in a pocket, someone else closing the record
// first, retrying it forever hides the problem behind an optimistic tick. So:
//
//   • 4xx is TERMINAL. It will never succeed on retry, and the user must be told.
//   • 5xx and network failures retry with backoff, up to a cap.
//   • Past the cap the entry is parked as FAILED and surfaced, never dropped.
//   • Storage that cannot accept the entry reports so, rather than pretending.
//
// A queue that silently loses work is worse than no queue, because the user
// believes the job is done.

export type OutboxStatus = "PENDING" | "SENDING" | "FAILED";

export type OutboxEntry = {
  id: string;
  url: string;
  method: string;
  body: string;
  // What the user thinks they did: "PM checklist for LEE/PE/0012".
  label: string;
  // Replaces an earlier entry for the same thing, so double-tapping Submit or
  // re-saving a checklist does not queue two copies.
  dedupeKey?: string | null;
  createdAt: string;
  attempts: number;
  status: OutboxStatus;
  lastError?: string | null;
};

export const MAX_ATTEMPTS = 5;
export const STORAGE_KEY = "limsl.outbox.v1";

// Roughly 4 MB of the usual 5 MB localStorage budget. PM checklists carry two
// signature images, so a handful of them is a realistic ceiling, better to
// refuse the eleventh honestly than to evict the first ten silently.
export const MAX_STORE_BYTES = 4_000_000;

// A 4xx will never succeed on a retry. Treating it as retryable turns a
// fixable validation error into an item that spins forever and is never read.
export function shouldRetry(status: number | null): boolean {
  if (status === null) return true;            // network failure, the whole point
  if (status === 408 || status === 429) return true; // timeout / rate limit are transient
  if (status >= 500) return true;
  return false;
}

export function isTerminal(entry: Pick<OutboxEntry, "attempts">): boolean {
  return entry.attempts >= MAX_ATTEMPTS;
}

// Exponential with a ceiling: 2s, 4s, 8s, 16s, 30s.
export function nextBackoffMs(attempts: number): number {
  const n = Math.max(0, attempts);
  return Math.min(30_000, 2_000 * 2 ** n);
}

// Adding an entry. A matching dedupeKey REPLACES rather than appends.
export function upsertEntry(queue: OutboxEntry[], entry: OutboxEntry): OutboxEntry[] {
  if (!entry.dedupeKey) return [...queue, entry];
  const without = queue.filter((e) => e.dedupeKey !== entry.dedupeKey);
  return [...without, entry];
}

export function removeEntry(queue: OutboxEntry[], id: string): OutboxEntry[] {
  return queue.filter((e) => e.id !== id);
}

// Applying the outcome of one send attempt.
export function applyResult(
  entry: OutboxEntry,
  result: { ok: true } | { ok: false; status: number | null; error?: string },
): { keep: false } | { keep: true; entry: OutboxEntry } {
  if (result.ok) return { keep: false };

  const attempts = entry.attempts + 1;
  const retryable = shouldRetry(result.status);

  // Either a permanent rejection or out of attempts: park it, visibly.
  if (!retryable || attempts >= MAX_ATTEMPTS) {
    return {
      keep: true,
      entry: {
        ...entry,
        attempts,
        status: "FAILED",
        lastError:
          result.error ??
          (retryable
            ? `Gave up after ${attempts} attempts.`
            : `Rejected by the server (${result.status ?? "error"}). Retrying will not help.`),
      },
    };
  }

  return { keep: true, entry: { ...entry, attempts, status: "PENDING", lastError: result.error ?? null } };
}

// Only entries worth sending now, a FAILED one waits for the user to decide.
export const sendable = (queue: OutboxEntry[]): OutboxEntry[] =>
  queue.filter((e) => e.status === "PENDING");

export const failed = (queue: OutboxEntry[]): OutboxEntry[] =>
  queue.filter((e) => e.status === "FAILED");

export function serialize(queue: OutboxEntry[]): string {
  return JSON.stringify(queue);
}

// Never throws on corrupt storage: a broken outbox must not take the page down
// with it, and an unreadable queue is reported as empty rather than fatal.
export function deserialize(raw: string | null): OutboxEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is OutboxEntry =>
        !!e && typeof e.id === "string" && typeof e.url === "string" && typeof e.body === "string",
    );
  } catch {
    return [];
  }
}

// Whether the queue would still fit. Refusing loudly beats evicting silently.
export function fitsInStore(queue: OutboxEntry[], limit = MAX_STORE_BYTES): boolean {
  return serialize(queue).length <= limit;
}

export function describeAge(createdAt: string, now: Date = new Date()): string {
  const ms = now.getTime() - Date.parse(createdAt);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} day(s) ago`;
}
