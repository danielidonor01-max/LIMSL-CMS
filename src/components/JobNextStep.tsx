// src/components/JobNextStep.tsx
// "What do I do now?" — one panel, one button (LIMSL, 16 Nov 2026).
//
// A first PM in production put Start Work, Clock on and Fill PM Checklist
// side by side, with a readiness list and a time card under them. They were
// three names for one road, and a first-time user could not tell which to
// press. The road is:
//
//   1. Cleared to start   the documents are signed (nothing to press)
//   2. Start work         starts your time and puts the job in progress
//   3. Fill the checklist (PM) or Complete the work (repair)
//
// The panel shows where the job is on that road and offers the one button
// for the next step. Pausing is a small secondary action, and finishing the
// job stops everybody's time on its own (lib/maintenance/time-log-db.ts).
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Check, ChevronDown, CircleDashed, ClipboardCheck, CheckCircle2, Pause, Play, ShieldAlert,
} from "lucide-react";
import Button from "@/components/Button";
import type { JobReadiness } from "@/lib/maintenance/work-readiness-db";
import { formatHours } from "@/lib/maintenance/time-log";
import { cn } from "@/lib/utils";

type Running = { userId: string | null; userName: string | null; startedAt: string };

const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
const duration = (mins: number) => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`);
const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function JobNextStep({
  workOrderId,
  status,
  isPreventive,
  canWork,
  userId,
  running,
  myHours,
  totalHours,
  busy,
  onStart,
  onPause,
  onComplete,
  onReadyChange,
}: {
  workOrderId: string;
  status: string;
  isPreventive: boolean;
  // Holds the tools: may start, pause and finish.
  canWork: boolean;
  userId?: string;
  running: Running[];
  myHours: number;
  totalHours: number;
  busy: boolean;
  onStart: () => void;
  onPause: () => void;
  onComplete: () => void;
  onReadyChange?: (ok: boolean) => void;
}) {
  const [data, setData] = useState<JobReadiness | null>(null);
  const [showChecks, setShowChecks] = useState(false);
  const [asking, setAsking] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(() => {
    fetch(`/api/work-orders/${workOrderId}/readiness`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: JobReadiness | null) => {
        setData(d);
        if (d) onReadyChange?.(d.ok);
      })
      .catch(() => {});
  }, [workOrderId, onReadyChange]);
  useEffect(load, [load]);

  const mine = running.find((r) => r.userId && r.userId === userId) ?? null;
  const others = running.filter((r) => r !== mine);

  useEffect(() => {
    if (!mine) return;
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, [mine]);

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
            ? "Already asked today. The Factory Manager has the request."
            : "Asked. The Factory Manager has been told to revalidate the permit for today.",
      );
      load();
    } finally {
      setAsking(false);
    }
  };

  if (!data) return null;

  const awaitingApproval = status === "PENDING_APPROVAL" || status === "REJECTED";
  const cleared = data.ok && !awaitingApproval;
  const started = status === "IN_PROGRESS";
  const finishLabel = isPreventive ? "Fill in the PM checklist" : "Complete the work";

  // Which of the three steps is current.
  const current = !cleared ? 0 : !mine ? 1 : 2;
  const steps = ["Cleared to start", "Start work", isPreventive ? "Fill the checklist" : "Complete the work"];

  let headline: string;
  let detail: string;
  if (!cleared) {
    headline = awaitingApproval ? "Waiting for approval to start" : "Not cleared to start yet";
    detail =
      data.firstBlocker?.detail ??
      "The work order needs its approval to commence before anybody starts. It is signed further down this page.";
  } else if (mine) {
    const mins = minutesSince(mine.startedAt, now);
    headline = `You are on this job: ${duration(mins)}`;
    detail = `Started at ${clockTime(mine.startedAt)}. ${
      isPreventive
        ? "When the machine is done, fill in its checklist. That finishes the job and stops your time."
        : "When the repair is done, complete the work. That finishes the job and stops your time."
    }`;
  } else if (canWork) {
    headline = started ? "Ready to carry on" : "Ready to start";
    detail = started
      ? "Press Resume when you are back at the machine. Your time counts from then."
      : "Everything is signed. Press Start when you are at the machine: it records that the job is under way and starts your time.";
  } else {
    headline = started ? "Work is under way" : "Cleared, waiting for the technician to start";
    detail = running.length
      ? `${running.map((r) => r.userName ?? "Someone").join(", ")} ${running.length > 1 ? "are" : "is"} on the job now.`
      : "The person on the job starts it from this page.";
  }

  return (
    <section
      className={cn(
        "bg-surface border rounded-xl shadow-card overflow-hidden",
        !cleared ? "border-warn-200" : mine ? "border-brand-300" : "border-line",
      )}
    >
      <div className="p-5 sm:p-6 space-y-4">
        {/* The road, so the page never has to explain it in words. */}
        <ol className="flex items-center gap-2 text-xs" aria-label="Steps to do this job">
          {steps.map((label, i) => {
            const done = i < current;
            const now_ = i === current;
            return (
              <li key={label} className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    done ? "bg-brand-600 text-white" : now_ ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-500",
                  )}
                >
                  {done ? <Check className="w-3 h-3" /> : i + 1}
                </span>
                {/* On a phone only the current step is named; the others
                    are their numbers, so the row never truncates. */}
                <span
                  className={cn(
                    "whitespace-nowrap",
                    now_ ? "font-semibold text-ink-900" : done ? "hidden sm:inline text-ink-600" : "hidden sm:inline text-ink-400",
                  )}
                >
                  {label}
                </span>
                {i < steps.length - 1 && <span className="hidden sm:block w-6 h-px bg-ink-200 shrink-0" />}
              </li>
            );
          })}
        </ol>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-ink-900 flex items-center gap-2">
              {!cleared && <ShieldAlert className="w-4 h-4 text-warn-600 shrink-0" />}
              {mine && <span className="size-2 rounded-full bg-brand-500 motion-safe:animate-pulse shrink-0" />}
              {headline}
            </h2>
            <p className="text-sm text-ink-600 mt-1 leading-relaxed">{detail}</p>
            {mine && others.length > 0 && (
              <p className="text-xs text-ink-500 mt-1">
                Also on the job: {others.map((r) => r.userName ?? "Someone").join(", ")}.
              </p>
            )}
          </div>

          {canWork && (
            <div className="flex flex-col sm:items-end gap-2 shrink-0">
              {cleared && !mine && (
                <Button icon={Play} loading={busy} onClick={onStart} className="min-w-44">
                  {started && myHours > 0 ? "Resume work" : "Start work"}
                </Button>
              )}
              {cleared && mine && (
                <>
                  {isPreventive ? (
                    <Button href={`/work-orders/${workOrderId}/pm-checklist`} icon={ClipboardCheck} className="min-w-44">
                      {finishLabel}
                    </Button>
                  ) : (
                    <Button icon={CheckCircle2} onClick={onComplete} className="min-w-44">
                      {finishLabel}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={onPause}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900 disabled:opacity-60"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pause, I am stepping away
                  </button>
                </>
              )}
              {!cleared && data.needsRevalidation && (
                data.revalidationRequested ? (
                  <p className="text-sm text-ink-600">
                    {data.revalidationRequested.byName ?? "The permit holder"} asked the Factory Manager
                    {data.revalidationRequested.at
                      ? ` at ${new Date(data.revalidationRequested.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                    . Work starts once the permit is revalidated.
                  </p>
                ) : !data.permitHolderId || data.permitHolderId === userId ? (
                  <Button loading={asking} onClick={ask}>
                    Ask the Factory Manager to revalidate
                  </Button>
                ) : (
                  <p className="text-sm text-ink-600">
                    {data.permitHolderName ?? "The permit holder"} asks the Factory Manager for today&apos;s
                    revalidation.
                  </p>
                )
              )}
            </div>
          )}
        </div>

        {totalHours > 0 && (
          <p className="text-xs text-ink-500">
            Time booked so far: <span className="font-medium text-ink-700 tabular-nums">{formatHours(totalHours)}</span>
            {myHours > 0 && myHours !== totalHours && <> (yours {formatHours(myHours)})</>}
          </p>
        )}
      </div>

      {/* The full list of what has to be signed, for whoever wants it. */}
      <div className="border-t border-line">
        <button
          type="button"
          onClick={() => setShowChecks((v) => !v)}
          aria-expanded={showChecks}
          className="w-full flex items-center justify-between gap-3 px-5 sm:px-6 py-3 text-sm text-ink-600 hover:bg-ink-50 transition-colors"
        >
          <span>
            {data.checks.filter((c) => c.ok).length} of {data.checks.length} safety checks in place
            {data.permitNumber && <span className="text-ink-400"> · {data.permitNumber}</span>}
          </span>
          <ChevronDown className={cn("w-4 h-4 transition-transform", showChecks && "rotate-180")} />
        </button>
        {showChecks && (
          <ul className="divide-y divide-ink-200 border-t border-line">
            {data.checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3 px-5 sm:px-6 py-2.5">
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
            {data.permitId && data.permitNumber && (
              <li className="px-5 sm:px-6 py-2.5">
                <Link href={`/permits/${data.permitId}`} className="text-xs text-brand-700 hover:underline">
                  Open {data.permitNumber}
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
