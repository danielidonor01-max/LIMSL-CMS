// src/components/PageLead.tsx
// The one card at the top of a page that answers the question the page exists
// to answer.
//
// Lifted out of DashboardHero, which had the only instance of it. Two more
// pages needed the same treatment and copying the markup a third time is how a
// design system becomes fifteen slightly different headers, which is the exact
// finding the last three audits kept returning to.
//
// The shape is deliberate. A headline that STATES the answer rather than
// labelling the page, one supporting sentence, the actions that follow from the
// answer, and a single dark panel carrying the one figure worth reading from
// across a room. Everything else on the page stays quiet: one bold thing per
// screen.
"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { m, useReducedMotion } from "motion/react";
import AnimatedCounter from "@/components/AnimatedCounter";
import { parseFigure } from "@/lib/figure";

// Rolls the number only when it can be drawn back exactly. parseFloat used to
// decide this, and it turned "92%" into "92" and "3.5" into "4".
function Figure({ value, duration }: { value: number | string; duration: number }) {
  const f = parseFigure(value);
  if (!f) return <>{value}</>;
  return (
    <AnimatedCounter
      value={f.num}
      decimals={f.decimals}
      padStart={f.padStart}
      separator={f.separator}
      prefix={f.prefix || undefined}
      suffix={f.suffix || undefined}
      duration={duration}
    />
  );
}

export type LeadTone = "good" | "warn" | "bad";

export type LeadFigure = {
  label: string;
  value: string;
  unit?: string;
  /** 0-100. Draws the bar under the figure. Omit for a figure that is not a proportion. */
  progress?: number;
  tone?: LeadTone;
};

export type LeadStat = {
  label: string;
  value: number | string;
  tone?: "plain" | "warn" | "bad";
};

export type LeadAction = { href: string; label: string; primary?: boolean };

const BAR: Record<LeadTone, string> = {
  good: "bg-brand-500",
  warn: "bg-warn-500",
  bad: "bg-danger-500",
};

export default function PageLead({
  headline,
  supporting,
  actions = [],
  figure,
  stats = [],
  meta,
  headingId = "page-lead-heading",
}: {
  headline: string;
  supporting: string;
  actions?: LeadAction[];
  figure: LeadFigure;
  stats?: LeadStat[];
  meta?: React.ReactNode;
  headingId?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <section
      aria-labelledby={headingId}
      className="rounded-xl border border-line bg-surface overflow-hidden shadow-card"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 p-6 lg:p-8">
        <div className="min-w-0 max-w-2xl">
          <h1
            id={headingId}
            className="font-display text-display text-ink-900 text-balance"
          >
            {headline}
          </h1>
          <p className="text-sm text-ink-600 mt-3 leading-relaxed">{supporting}</p>

          {actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 mt-6">
              {actions.map((a) =>
                a.primary === false ? (
                  <Link
                    key={a.href + a.label}
                    href={a.href}
                    className="inline-flex items-center rounded-lg bg-surface border border-ink-300 text-ink-700 hover:bg-ink-100 px-4 min-h-11 text-xs font-semibold transition-colors"
                  >
                    {a.label}
                  </Link>
                ) : (
                  <Link
                    key={a.href + a.label}
                    href={a.href}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-nav hover:bg-nav-active text-white px-4 min-h-11 text-xs font-semibold transition-colors"
                  >
                    {a.label}
                    <ArrowUpRight className="w-4 h-4" />
                  </Link>
                ),
              )}
            </div>
          )}

          {meta && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-5 text-xs text-ink-600">{meta}</p>
          )}
        </div>

        <div className="lg:w-72 rounded-xl bg-nav text-white p-5 flex flex-col justify-between">
          <p className="text-xs font-semibold tracking-[0.12em] text-nav-label">
            {figure.label}
          </p>

          <div className="flex items-end gap-2 mt-4">
            <span className="text-3xl font-semibold leading-none tabular-nums">
              <Figure value={figure.value} duration={0.6} />
            </span>
            {figure.unit && (
              <span className="text-xl text-nav-text leading-none mb-1">{figure.unit}</span>
            )}
          </div>

          {figure.progress !== undefined && (
            <div
              className="mt-4 h-1.5 rounded-full bg-nav-active overflow-hidden"
              role="img"
              aria-label={`${Math.round(figure.progress)} percent`}
            >
              {/* Grown with scaleX, not width: width re-lays out the panel on
                  every frame of the spring, a transform does not. Later changes
                  to the figure ease the width in CSS. */}
              <m.span
                className={`block h-full rounded-full origin-left transition-[width] duration-500 ${BAR[figure.tone ?? "good"]}`}
                style={{ width: `${Math.max(0, Math.min(100, figure.progress))}%` }}
                initial={reduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>
          )}

          {stats.length > 0 && (
            <dl
              className={`grid gap-3 mt-5 pt-4 border-t border-nav-line ${
                stats.length >= 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {stats.map((s) => (
                <LeadStatCell key={s.label} {...s} />
              ))}
            </dl>
          )}
        </div>
      </div>
    </section>
  );
}

function LeadStatCell({ label, value, tone = "plain" }: LeadStat) {
  // The same zero rule as MetricPanel. "0 overdue" in the same white as "2 down"
  // gives a real number and an empty one identical weight, on the one panel
  // meant to be read fastest.
  const empty = value === 0 || value === "0";
  const colour = empty
    ? "text-nav-text"
    : tone === "bad"
      ? "text-danger-400"
      : tone === "warn"
        ? "text-warn-400"
        : "text-white";
  return (
    <div>
      <dd className={`text-xl font-semibold leading-none tabular-nums ${colour}`}>
        <Figure value={value} duration={0.5} />
      </dd>
      <dt className="text-xs text-nav-text mt-1.5">{label}</dt>
    </div>
  );
}
