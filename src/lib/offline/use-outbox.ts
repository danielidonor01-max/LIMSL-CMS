// src/lib/offline/use-outbox.ts
// The browser half of the outbox: persistence, the flush loop, and the hook a
// form calls instead of fetch(). All the decisions live in ./outbox.ts, which is
// pure and tested; this file only moves bytes and schedules work.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  STORAGE_KEY,
  deserialize,
  serialize,
  upsertEntry,
  removeEntry,
  applyResult,
  sendable,
  fitsInStore,
  nextBackoffMs,
  type OutboxEntry,
} from "./outbox";

const CHANGED = "limsl:outbox-changed";

function read(): OutboxEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return deserialize(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

// Returns false when the queue could not be persisted — the caller must then
// tell the user, never assume the work is safe.
function write(queue: OutboxEntry[]): boolean {
  if (typeof window === "undefined") return false;
  if (!fitsInStore(queue)) return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, serialize(queue));
    window.dispatchEvent(new Event(CHANGED));
    return true;
  } catch {
    // Quota exceeded, or storage blocked (private mode). Either way the entry
    // is not saved, and saying otherwise would be the one unforgivable bug here.
    return false;
  }
}

export type QueueOutcome =
  | { ok: true; sent: true; response: Response }
  | { ok: true; sent: false }                        // parked for later
  | { ok: false; error: string };                    // could not send OR park

// Send now if we can; otherwise park it. Used by forms in place of fetch().
export async function submitOrQueue(input: {
  url: string;
  method?: string;
  body: unknown;
  label: string;
  dedupeKey?: string | null;
}): Promise<QueueOutcome> {
  const payload = JSON.stringify(input.body);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  if (online) {
    try {
      const res = await fetch(input.url, {
        method: input.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      return { ok: true, sent: true, response: res };
    } catch {
      // Reachability lied — navigator.onLine only knows about the network
      // interface, not whether anything is actually answering on it. Fall
      // through and park.
    }
  }

  const entry: OutboxEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url: input.url,
    method: input.method ?? "POST",
    body: payload,
    label: input.label,
    dedupeKey: input.dedupeKey ?? null,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "PENDING",
  };

  const next = upsertEntry(read(), entry);
  if (!write(next)) {
    return {
      ok: false,
      error:
        "There is no room left on this device to hold another offline submission. Reconnect and send the queued items before adding more.",
    };
  }
  return { ok: true, sent: false };
}

// Drains the queue. Safe to call repeatedly; only one drain runs at a time.
let draining = false;
export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (draining || typeof window === "undefined") return { sent: 0, failed: 0 };
  draining = true;
  let sent = 0;
  let failedCount = 0;

  try {
    for (const item of sendable(read())) {
      if (!navigator.onLine) break;

      let outcome: { ok: true } | { ok: false; status: number | null; error?: string };
      try {
        const res = await fetch(item.url, {
          method: item.method,
          headers: { "Content-Type": "application/json" },
          body: item.body,
        });
        if (res.ok) {
          outcome = { ok: true };
        } else {
          const d = await res.json().catch(() => ({}));
          outcome = { ok: false, status: res.status, error: d?.error };
        }
      } catch {
        outcome = { ok: false, status: null };
      }

      const result = applyResult(item, outcome);
      // Re-read each time: the user may have queued or discarded something else
      // while this request was in flight.
      const current = read();
      if (result.keep) {
        write(upsertEntry(removeEntry(current, item.id), result.entry));
        if (result.entry.status === "FAILED") failedCount++;
        else await new Promise((r) => setTimeout(r, nextBackoffMs(result.entry.attempts)));
      } else {
        write(removeEntry(current, item.id));
        sent++;
      }
    }
  } finally {
    draining = false;
  }

  return { sent, failed: failedCount };
}

export function discardEntry(id: string): void {
  write(removeEntry(read(), id));
}

export function retryEntry(id: string): void {
  const q = read().map((e) => (e.id === id ? { ...e, status: "PENDING" as const, attempts: 0, lastError: null } : e));
  write(q);
}

// Live view of the queue for the UI.
export function useOutbox() {
  const [queue, setQueue] = useState<OutboxEntry[]>([]);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);

  const refresh = useCallback(() => setQueue(read()), []);

  useEffect(() => {
    refresh();
    setOnline(navigator.onLine);

    const onChange = () => refresh();
    const onOnline = async () => {
      setOnline(true);
      if (flushing.current) return;
      flushing.current = true;
      try {
        await flushOutbox();
      } finally {
        flushing.current = false;
        refresh();
      }
    };
    const onOffline = () => setOnline(false);

    window.addEventListener(CHANGED, onChange);
    window.addEventListener("storage", onChange);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    // Anything left from a previous session goes out as soon as we load.
    if (navigator.onLine) void onOnline();

    return () => {
      window.removeEventListener(CHANGED, onChange);
      window.removeEventListener("storage", onChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [refresh]);

  return { queue, online, refresh, flush: flushOutbox, discard: discardEntry, retry: retryEntry };
}
