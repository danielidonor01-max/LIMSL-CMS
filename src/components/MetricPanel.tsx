// src/components/MetricPanel.tsx
// A row of figures as one panel with hairline dividers, not a row of floating
// cards.
//
// Taken from the reference product's analytics page, and it is the better
// pattern for this app for a reason beyond looks: separate cards each carry
// their own border and shadow, so eight of them turn a page into gravel and the
// eye has to re-enter every one. One panel reads as a single object, which is
// what a set of related measures actually is.
//
// The dividers are a 1px grid gap showing the line colour through, rather than
// borders on the cells. Cell borders have to be cancelled on the last item of
// each row, and "last" changes with the breakpoint, so they are always wrong at
// one width. A gap cannot be.
"use client";

import type { ElementType } from "react";

export type Metric = {
  key: string;
  label: string;
  value: string;
  target?: string;
  description?: string;
  icon?: ElementType;
  // The figure itself carries the state. The reference has no status on its
  // metrics; a maintenance system does, and colouring the number is stronger
  // than tinting the whole cell, which shouts at the reader four times over.
  status?: "danger" | "warning" | "success" | "plain";
};

const VALUE_TONE: Record<string, string> = {
  danger: "text-danger-600",
  warning: "text-warn-600",
  success: "text-ink-900",
  plain: "text-ink-900",
};

export default function MetricPanel({
  metrics,
  columns = 4,
  label,
}: {
  metrics: Metric[];
  columns?: 3 | 4;
  label?: string;
}) {
  if (metrics.length === 0) return null;

  const cols = columns === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4";

  return (
    <section
      aria-label={label ?? "Key measures"}
      className={`grid grid-cols-1 ${cols} gap-px bg-line rounded-2xl border border-line overflow-hidden shadow-card`}
    >
      {metrics.map((m) => {
        const Icon = m.icon;
        return (
          <div key={m.key} className="bg-surface p-5 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-500 leading-tight">
                {m.label}
              </p>
              {Icon && (
                <span className="w-7 h-7 rounded-lg border border-line grid place-items-center shrink-0">
                  <Icon className="w-3.5 h-3.5 text-ink-400" />
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-1.5 mt-4">
              <span
                className={`text-4xl font-semibold tracking-[-0.02em] tabular-nums leading-none ${
                  VALUE_TONE[m.status ?? "plain"]
                }`}
              >
                {m.value}
              </span>
              {m.target && <span className="text-xs text-ink-400 font-mono">/ {m.target}</span>}
            </div>

            {m.description && (
              <p className="text-xs text-ink-500 mt-3 leading-relaxed">{m.description}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
