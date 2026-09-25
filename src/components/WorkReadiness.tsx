// src/components/WorkReadiness.tsx
// "Can I start today?" — answered with the whole list, not a disabled button.
//
// Before a technician clocks on, every document behind the job has to be
// signed and approved, and after the first day the permit has to be
// revalidated for today. The server refuses clock-on until it is. This is the
// same check, shown as a list, so the person at the machine can see exactly
// which document is outstanding and who it is waiting on — and, when the only
// thing missing is today's revalidation, ask for it from here.
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, CircleDashed, ShieldCheck, ShieldAlert } from "lucide-react";
import Button from "@/components/Button";
import type { JobReadiness } from "@/lib/maintenance/work-readiness-db";

export default function WorkReadiness({
  workOrderId,
  onChange,
  className = "",
}: {
  workOrderId: string;
  /** Told when readiness is (re)loaded, so a page can enable its clock-on. */
  onChange?: (ready: boolean) => void;
  className?: string;
}) {
  const [data, setData] = useState<JobReadiness | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/work-orders/${workOrderId}/readiness`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JobReadiness | null) => {
        setData(d);
        if (d) onChange?.(d.ok);
      })
      .catch(() => {});
  }, [workOrderId, onChange]);

  useEffect(load, [load]);

  const ask = async () => {
    if (!data?.permitId) return;
    setAsking(true);
    try {
      const res = await fetch(`/api/permits/${data.permitId}/revalidation-request`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not send the request.");
        return;
      }
      toast.success(
        d.alreadyRevalidated
          ? "Today is already revalidated."
          : d.alreadyAsked
            ? "Already asked today. The Maintenance Manager has the request."
            : "Asked. The Maintenance Manager has been told to revalidate the permit for today.",
      );
      load();
    } finally {
      setAsking(false);
    }
  };

  if (!data) return null;

  return (
    <section className={`bg-surface border border-line rounded-xl shadow-card overflow-hidden ${className}`}>
      <header className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {data.ok ? (
            <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" aria-hidden="true" />
          ) : (
            <ShieldAlert className="w-4 h-4 text-warn-600 shrink-0" aria-hidden="true" />
          )}
          <h2 className="text-sm font-semibold text-ink-900">
            {data.ok ? "Cleared to start today" : "Not cleared to start"}
          </h2>
        </div>
        {data.permitId && data.permitNumber && (
          <Link href={`/permits/${data.permitId}`} className="text-xs text-brand-700 hover:underline shrink-0">
            {data.permitNumber}
          </Link>
        )}
      </header>

      <ul className="divide-y divide-ink-200">
        {data.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-3 px-4 py-2.5">
            {c.ok ? (
              <CheckCircle2 className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" aria-label="Done" />
            ) : (
              <CircleDashed className="w-4 h-4 text-warn-600 mt-0.5 shrink-0" aria-label="Outstanding" />
            )}
            <div className="min-w-0">
              <p className={`text-sm ${c.ok ? "text-ink-700" : "text-ink-900 font-medium"}`}>{c.label}</p>
              <p className="text-xs text-ink-500 leading-relaxed">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>

      {data.needsRevalidation && (
        <div className="px-4 py-3 border-t border-line bg-warn-500/5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-700 leading-relaxed min-w-0 flex-1">
            Everything else is in place. The permit needs today&apos;s revalidation before work starts.
          </p>
          <Button size="sm" loading={asking} onClick={ask}>
            Ask for today&apos;s revalidation
          </Button>
        </div>
      )}
    </section>
  );
}
