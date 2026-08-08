// src/components/OutboxTray.tsx
// What is waiting to be sent, and what was refused.
//
// A queue nobody can see is a queue nobody trusts — and worse, a rejected
// submission that only lives in localStorage is a job the workshop believes is
// recorded. This sits under the offline banner and stays visible until the queue
// is empty.
"use client";

import { CloudUpload, AlertTriangle, RotateCw, Trash2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useOutbox } from "@/lib/offline/use-outbox";
import { describeAge, failed, sendable } from "@/lib/offline/outbox";

export default function OutboxTray() {
  const { queue, online, flush, discard, retry, refresh } = useOutbox();
  const [busy, setBusy] = useState(false);

  if (!queue.length) return null;

  const waiting = sendable(queue);
  const rejected = failed(queue);

  const sendNow = async () => {
    setBusy(true);
    try {
      const r = await flush();
      refresh();
      if (r.sent > 0) toast.success(`${r.sent} queued submission${r.sent === 1 ? "" : "s"} sent.`);
      if (r.failed > 0) toast.error(`${r.failed} could not be sent — see the reason below.`);
      if (r.sent === 0 && r.failed === 0) toast.info("Nothing could be sent yet — still no connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="no-print border-b border-slate-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 space-y-2.5">
        {waiting.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <p className="text-xs text-slate-700 flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-sky-600 shrink-0" />
              <span>
                <strong>
                  {waiting.length} submission{waiting.length === 1 ? "" : "s"} waiting to send
                </strong>{" "}
                <span className="text-slate-500">
                  {online ? "— sending automatically." : "— they will go as soon as you have signal."}
                </span>
              </span>
            </p>
            {online && (
              <button
                onClick={sendNow}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 min-h-9 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 text-xs font-semibold hover:bg-sky-100 disabled:opacity-60 w-fit"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
                Send now
              </button>
            )}
          </div>
        )}

        {waiting.length > 0 && (
          <ul className="space-y-1">
            {waiting.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span className="truncate">{e.label}</span>
                <span className="shrink-0">{describeAge(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Refused. This is the case that must never be quiet. */}
        {rejected.map((e) => (
          <div key={e.id} className="rounded-lg border border-rose-200 bg-rose-50 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-rose-900">Not sent — {e.label}</p>
                <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                  {e.lastError ?? "The server refused this submission."}
                </p>
                <p className="text-[10px] text-rose-700/80 mt-1">
                  Queued {describeAge(e.createdAt)} · {e.attempts} attempt{e.attempts === 1 ? "" : "s"}. Nothing has
                  been recorded for this — you will need to redo it or discard it.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pl-6">
              <button
                onClick={() => {
                  retry(e.id);
                  refresh();
                  toast.info("Queued again — it will retry on the next send.");
                }}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg border border-rose-300 text-rose-700 text-[11px] font-semibold hover:bg-rose-100"
              >
                <RotateCw className="w-3.5 h-3.5" /> Try again
              </button>
              <button
                onClick={() => {
                  discard(e.id);
                  refresh();
                  toast.success("Discarded.");
                }}
                className="inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg text-rose-700 text-[11px] font-semibold hover:bg-rose-100"
              >
                <Trash2 className="w-3.5 h-3.5" /> Discard
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
