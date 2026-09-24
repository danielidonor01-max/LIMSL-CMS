// src/components/FlowRail.tsx
// Where a job has got to, and the one thing that happens next.
//
// The documents were always there and always correctly gated; what nobody
// could see was the order. Somebody looking at a permit could not tell whether
// the method statement existed, and somebody looking at a method statement had
// no idea anybody was waiting for it. So this shows the whole sequence at once,
// marks the step the job is actually on, and puts the call to action on that
// step and nowhere else — because a screen offering six things to do next is
// not telling you what to do next.
"use client";

import Link from "next/link";
import { Check, ChevronRight, Lock } from "lucide-react";
import type { FlowState, FlowStep } from "@/lib/maintenance/flow";
import { canTake } from "@/lib/maintenance/flow";
import { ROLE_LABELS } from "@/lib/roles";
import Button from "@/components/Button";

export type FlowLink = {
  /** Where the step's finished document lives, once it exists. */
  href?: string;
  /** What the finished document is called, e.g. "WMS-2026-0044". */
  ref?: string;
  /** Where the current step is taken. Only read for the current step. */
  actionHref?: string;
  /** Taken in place of navigating, for steps that are one click. */
  onAction?: () => void;
  /** Overrides the step's own wording when the situation is more specific. */
  actionLabel?: string;
  /** Shown instead of an action when something else must happen first. */
  waitingOn?: string;
};

function StepMarker({ state, index }: { state: "done" | "current" | "later"; index: number }) {
  if (state === "done") {
    return (
      <span className="w-6 h-6 rounded-full bg-brand-500 text-white grid place-items-center shrink-0">
        <Check className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="w-6 h-6 rounded-full border-2 border-brand-500 text-brand-700 grid place-items-center shrink-0 text-xs font-semibold tabular-nums">
        {index + 1}
      </span>
    );
  }
  return (
    <span className="w-6 h-6 rounded-full border border-ink-200 text-ink-400 grid place-items-center shrink-0 text-xs tabular-nums">
      {index + 1}
    </span>
  );
}

export default function FlowRail({
  flow,
  role,
  links = {},
  title = "Where this job is",
  className = "",
}: {
  flow: FlowState;
  role?: string | null;
  /** Keyed by step key. */
  links?: Record<string, FlowLink>;
  title?: string;
  className?: string;
}) {
  const finished = flow.currentIndex >= flow.steps.length;

  return (
    <section className={`bg-surface border border-line rounded-xl shadow-card overflow-hidden ${className}`}>
      <header className="px-4 py-3 border-b border-line flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        <span className="text-xs text-ink-500 tabular-nums">
          {finished ? "Complete" : `Step ${flow.currentIndex + 1} of ${flow.steps.length}`}
        </span>
      </header>

      <ol className="divide-y divide-ink-200">
        {flow.steps.map((step: FlowStep, i) => {
          const state = i < flow.currentIndex ? "done" : i === flow.currentIndex ? "current" : "later";
          const link = links[step.key] ?? {};
          const mine = canTake(step, role);

          return (
            <li
              key={step.key}
              className={`flex items-start gap-3 px-4 py-3 ${state === "current" ? "bg-brand-500/5" : ""}`}
            >
              <StepMarker state={state} index={i} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-sm ${state === "later" ? "text-ink-400" : "text-ink-900 font-medium"}`}
                  >
                    {step.label}
                  </span>
                  {link.ref &&
                    (link.href ? (
                      <Link
                        href={link.href}
                        className="text-xs text-brand-700 hover:underline tabular-nums"
                      >
                        {link.ref}
                      </Link>
                    ) : (
                      <span className="text-xs text-ink-500 tabular-nums">{link.ref}</span>
                    ))}
                </div>

                {/* The current step is the only one that explains itself. On a
                    finished step the document is the explanation, and on a
                    later one the wording would be noise. */}
                {state === "current" && (
                  <>
                    <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">{step.because}</p>

                    {link.waitingOn ? (
                      <p className="text-xs text-warn-700 mt-2 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {link.waitingOn}
                      </p>
                    ) : mine ? (
                      <div className="mt-2">
                        {link.onAction ? (
                          <Button size="sm" onClick={link.onAction}>
                            {link.actionLabel ?? step.action}
                          </Button>
                        ) : link.actionHref ? (
                          <Button size="sm" href={link.actionHref} icon={ChevronRight}>
                            {link.actionLabel ?? step.action}
                          </Button>
                        ) : (
                          <p className="text-xs text-ink-600">{link.actionLabel ?? step.action}</p>
                        )}
                      </div>
                    ) : (
                      // Saying whose turn it is beats an inert greyed-out
                      // button, which tells somebody they cannot act without
                      // telling them who can.
                      <p className="text-xs text-ink-500 mt-2">
                        {step.action}. This one is for{" "}
                        {step.roles.length
                          ? step.roles
                              .filter((r) => r !== "SUPER_ADMIN")
                              .map((r) => ROLE_LABELS[r] ?? r)
                              .join(" or ")
                          : "the people on the job"}
                        .
                      </p>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
