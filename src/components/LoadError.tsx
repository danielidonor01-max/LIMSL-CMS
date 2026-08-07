// src/components/LoadError.tsx
// A failed fetch must never render as an empty state. On workshop wifi a
// dropped request used to look identical to "there is no work" — the
// technician walks away believing the list. This says what happened and
// offers the retry the cache hook already provides.
"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

export default function LoadError({
  what = "this data",
  onRetry,
}: {
  what?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
      <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-900">Couldn&apos;t load {what}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          This is a connection problem — the records are safe. Check your signal and try again.
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 min-h-11 px-4 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  );
}
