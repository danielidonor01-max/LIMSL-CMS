// src/components/DashboardHero.tsx
// The opening statement of the dashboard.
//
// The reference product leads with a personalised editorial line, "Your support
// floor is live, Daniel." It works there because a chat product's dashboard is
// mostly reassurance. Here the same slot has to earn a full screen of height on
// a system somebody opens to find out what is broken, so the sentence carries
// the state rather than a greeting: the headline IS the answer, and it changes.
//
// Everything else on this card stays quiet. One bold thing per screen.
"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export type HeroState = {
  firstName: string;
  roleLabel: string;
  brokenDown: number;
  totalEquipment: number;
  operational: number;
  overdue: number;
  awaitingSignature: number;
};

// Worst-first. A supervisor opening this needs the single most important fact
// in the first line, not a list to rank themselves.
function headline(s: HeroState): { text: string; lead: { href: string; label: string } } {
  const who = s.firstName ? `, ${s.firstName}` : "";

  if (s.brokenDown > 0) {
    return {
      text: `${s.brokenDown === 1 ? "One machine is" : `${s.brokenDown} machines are`} down${who}.`,
      lead: { href: "/corrective", label: "Open corrective records" },
    };
  }
  if (s.overdue > 0) {
    return {
      text: `${s.overdue === 1 ? "One activity is" : `${s.overdue} activities are`} overdue${who}.`,
      lead: { href: "/schedule", label: "Open the schedule" },
    };
  }
  if (s.awaitingSignature > 0) {
    return {
      text: `${s.awaitingSignature === 1 ? "One document is" : `${s.awaitingSignature} documents are`} waiting on you${who}.`,
      lead: { href: "/work-orders", label: "Review and sign" },
    };
  }
  return {
    text: `Nothing is overdue${who}.`,
    lead: { href: "/schedule", label: "Open the schedule" },
  };
}

function supporting(s: HeroState): string {
  if (s.brokenDown > 0) {
    return "Production is affected. Everything else on this page is secondary until the machine is running.";
  }
  if (s.overdue > 0) {
    return "Planned work has passed its date. Reschedule it or defer it on the record, but do not leave it silent.";
  }
  if (s.awaitingSignature > 0) {
    return "Work is authorised by signature, and these are the steps the chain is waiting on.";
  }
  return "Planned maintenance is on date and no machine is down. Keep an eye on what is due this week.";
}

export default function DashboardHero(props: { state: HeroState }) {
  const s = props.state;
  const { text, lead } = headline(s);
  const clean = s.brokenDown === 0 && s.overdue === 0;
  const availability = s.totalEquipment > 0 ? Math.round((s.operational / s.totalEquipment) * 100) : 0;

  return (
    <section
      aria-labelledby="hero-heading"
      className="rounded-2xl border border-line bg-surface overflow-hidden shadow-card"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 p-6 lg:p-8">
        <div className="min-w-0 max-w-2xl">
          <h1
            id="hero-heading"
            className="text-3xl sm:text-4xl font-bold tracking-[-0.03em] leading-[1.08] text-ink-900 text-balance"
          >
            {text}
          </h1>
          <p className="text-sm text-ink-600 mt-3 leading-relaxed">{supporting(s)}</p>

          <div className="flex flex-wrap items-center gap-2.5 mt-6">
            <Link
              href={lead.href}
              className="inline-flex items-center gap-1.5 rounded-lg bg-nav hover:bg-nav-active text-white px-4 min-h-11 text-xs font-semibold transition-colors"
            >
              {lead.label}
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            <Link
              href="/work-orders/new"
              className="inline-flex items-center rounded-lg bg-surface border border-ink-300 text-ink-700 hover:bg-ink-100 px-4 min-h-11 text-xs font-semibold transition-colors"
            >
              Raise a work order
            </Link>
          </div>

          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-5 text-xs text-ink-600">
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${clean ? "bg-brand-500" : "bg-danger-500"}`}
                aria-hidden="true"
              />
              {s.operational} of {s.totalEquipment} machines available
            </span>
            <span className="text-ink-400" aria-hidden="true">
              ·
            </span>
            <span>{s.roleLabel}</span>
          </p>
        </div>

        {/* The dark panel is the reference's move and it earns its place: it is
            the one figure worth reading from across a workshop. */}
        <div className="lg:w-72 rounded-xl bg-nav text-white p-5 flex flex-col justify-between">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-nav-label">
            Fleet availability
          </p>

          <div className="flex items-end gap-2 mt-4">
            <span className="text-5xl font-semibold leading-none tabular-nums">{availability}</span>
            <span className="text-lg text-nav-text leading-none mb-1">%</span>
          </div>

          <div
            className="mt-4 h-1 rounded-full bg-nav-active overflow-hidden"
            role="img"
            aria-label={`${availability} percent of machines available`}
          >
            <span
              className={`block h-full rounded-full ${availability >= 90 ? "bg-brand-500" : availability >= 75 ? "bg-warn-500" : "bg-danger-500"}`}
              style={{ width: `${availability}%` }}
            />
          </div>

          <dl className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-nav-line">
            <HeroStat label="down" value={s.brokenDown} tone={s.brokenDown > 0 ? "bad" : "plain"} />
            <HeroStat label="overdue" value={s.overdue} tone={s.overdue > 0 ? "warn" : "plain"} />
            <HeroStat label="to sign" value={s.awaitingSignature} tone="plain" />
          </dl>
        </div>
      </div>
    </section>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: number; tone: "plain" | "warn" | "bad" }) {
  const colour = tone === "bad" ? "text-danger-400" : tone === "warn" ? "text-warn-400" : "text-white";
  return (
    <div>
      <dd className={`text-xl font-semibold leading-none tabular-nums ${colour}`}>{value}</dd>
      <dt className="text-xs text-nav-text mt-1.5">{label}</dt>
    </div>
  );
}
