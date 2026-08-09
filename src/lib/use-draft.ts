// src/lib/use-draft.ts
// Local draft persistence for the two long forms, the PM checklist (~30
// inputs) and the corrective RCA. Both were all-or-nothing single POSTs with
// no draft anywhere in the app, so backgrounding the browser or losing the
// workshop wifi threw away fifteen minutes of standing at a machine.
//
// Deliberately localStorage, not the server: it survives a dropped connection,
// which is the exact case that loses work here. Drafts are per record and are
// cleared on successful submit.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "limsl-draft:";
const DEBOUNCE_MS = 800;

export function useDraft<T extends object>(
  key: string | null,
  value: T,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const [restored, setRestored] = useState<T | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const loadedFor = useRef<string | null>(null);

  // Offer whatever was saved last time, once per record, never apply it
  // silently, because a stale draft overwriting fresh server data is worse
  // than losing the draft.
  useEffect(() => {
    if (!key || !enabled || loadedFor.current === key) return;
    loadedFor.current = key;
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw) setRestored(JSON.parse(raw) as T);
    } catch {
      /* unreadable draft, ignore */
    }
  }, [key, enabled]);

  useEffect(() => {
    if (!key || !enabled) return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        /* quota or private mode, saving a draft must never break the form */
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [key, value, enabled]);

  const clear = useCallback(() => {
    if (!key) return;
    try {
      window.localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
    setRestored(null);
  }, [key]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setRestored(null);
  }, []);

  return { draft: dismissed ? null : restored, clearDraft: clear, dismissDraft: dismiss };
}

// Warn before a tab close / reload throws away unsaved work.
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
