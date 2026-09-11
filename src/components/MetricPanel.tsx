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
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { EMPTY_TONE } from "@/lib/status-tone";

export type Metric = {
  key: string;
  label: string;
  value: string;
  // Pass the raw number when the value is a plain count. It is what lets the
  // zero rule apply: a count of nothing is never given a status colour.
  count?: number;
  target?: string;
  description?: string;
  icon?: ElementType;
  // The figure itself carries the state. The reference has no status on its
  // metrics; a maintenance system does, and colouring the number is stronger
  // than tinting the whole cell, which shouts at the reader four times over.
  status?: "danger" | "warning" | "success" | "plain";
  // Direction of travel since the previous period, and which way is good. MTTR
  // falling and MTBF falling are both "down" and mean opposite things, so the
  // arrow cannot colour itself from the direction alone.
  trend?: "up" | "down" | "flat";
  trendGood?: "up" | "down";
};

const VALUE_TONE: Record<string, string> = {
  danger: "text-danger-600",
  warning: "text-warn-600",
  success: "text-ink-900",
  plain: "text-ink-900",
};

// Status colour says "there is something here to deal with". Nothing to deal
// with is never coloured, whatever the field is called. "Awaiting approval: 0"
// in amber reads as a problem from across the room; the reader walks over and
// finds nothing, and after a few of those they stop trusting the colour on the
// screens where it means a machine is down.
function toneFor(m: Metric): string {
  if (m.count !== undefined && (!Number.isFinite(m.count) || m.count === 0)) return EMPTY_TONE;
  return VALUE_TONE[m.status ?? "plain"];
}

// A flat arrow, not a coloured chip. It answers "which way is this going" in
// the corner of the cell and then gets out of the way; the figure is what the
// reader came for.
function Trend({ trend, trendGood }: Pick<Metric, "trend" | "trendGood">) {
  if (!trend || trend === "flat") {
    return <Minus className="w-3.5 h-3.5 text-ink-300 shrink-0" aria-label="unchanged" />;
  }
  const good = trendGood ? trend === trendGood : trend === "up";
  const Icon = trend === "up" ? TrendingUp : TrendingDown;
  return (
    <Icon
      className={`w-3.5 h-3.5 shrink-0 ${good ? "text-brand-600" : "text-danger-600"}`}
      aria-label={`trending ${trend}, ${good ? "improving" : "worsening"}`}
    />
  );
}

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
              <p className="text-xs font-semibold tracking-[0.1em] text-ink-500 leading-tight">
                {m.label}
              </p>
              {m.trend ? (
                <Trend {...m} />
              ) : (
                Icon && (
                  <span className="w-7 h-7 rounded-lg border border-line grid place-items-center shrink-0">
                    <Icon className="w-3.5 h-3.5 text-ink-400" />
                  </span>
                )
              )}
            </div>

            <div className="flex items-baseline gap-1.5 mt-4">
              <span
                className={`text-3xl font-semibold tracking-[-0.02em] tabular-nums leading-none ${toneFor(m)}`}
              >
                {m.value}
              </span>
              {/* Only ever a comparator target, "≥ 200 hrs". A bare number here
                  reads as a fraction: "4 / 0" for four overdue against a target
                  of none is nonsense. Anything that is not a threshold belongs
                  in the description. tabular-nums, not mono: a target is a
                  measurement, not a code. */}
              {m.target && <span className="text-xs text-ink-400 tabular-nums">/ {m.target}</span>}
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
