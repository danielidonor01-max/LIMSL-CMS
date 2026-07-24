// src/lib/api-cache.ts
// A tiny stale-while-revalidate cache for the app's client-side `/api/*` GETs.
// The CMS renders pages client-side and fetches in useEffect (see AGENTS.md §7),
// so without this every navigation re-hits the DB and shows a spinner. useApi()
// serves the last response instantly from an in-memory cache, then revalidates
// in the background — revisiting a page feels immediate. Concurrent callers for
// the same URL share one in-flight request (dedupe).
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CacheEntry<T> = { data: T; ts: number };
const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const DEFAULT_FRESH_MS = 30_000;

function fetchJson<T>(url: string): Promise<T> {
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      cache.set(url, { data, ts: Date.now() });
      return data as T;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p as Promise<T>;
}

// Seed the cache from data already in hand (e.g. after a create/update) so the
// next page that reads this URL renders it without a round trip.
export function primeApi<T>(url: string, data: T) {
  cache.set(url, { data, ts: Date.now() });
}

// Drop a cached URL (or every URL sharing a prefix) so the next read refetches.
export function invalidateApi(prefix: string) {
  for (const key of cache.keys()) if (key === prefix || key.startsWith(prefix)) cache.delete(key);
}

export function useApi<T>(
  url: string | null,
  fallback: T,
  opts: { freshMs?: number } = {},
): { data: T; loading: boolean; error: boolean; refresh: () => void; setData: (d: T) => void } {
  const freshMs = opts.freshMs ?? DEFAULT_FRESH_MS;
  const cached = url ? (cache.get(url) as CacheEntry<T> | undefined) : undefined;
  const [data, setData] = useState<T>(cached?.data ?? fallback);
  const [loading, setLoading] = useState<boolean>(!cached);
  const [error, setError] = useState(false);
  const alive = useRef(true);

  const run = useCallback(
    (force: boolean) => {
      if (!url) {
        setLoading(false);
        return;
      }
      const c = cache.get(url) as CacheEntry<T> | undefined;
      if (c) {
        setData(c.data);
        setError(false);
      }
      const fresh = c && Date.now() - c.ts < freshMs;
      if (fresh && !force) {
        setLoading(false);
        return;
      }
      if (!c) setLoading(true);
      fetchJson<T>(url)
        .then((d) => {
          if (!alive.current) return;
          setData(d);
          setError(false);
        })
        .catch(() => {
          if (alive.current) setError(true);
        })
        .finally(() => {
          if (alive.current) setLoading(false);
        });
    },
    [url, freshMs],
  );

  useEffect(() => {
    alive.current = true;
    run(false);
    return () => {
      alive.current = false;
    };
  }, [run]);

  return { data, loading, error, refresh: () => run(true), setData };
}
