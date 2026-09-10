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

import PageLead from "./PageLead";

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
  // Naming the fleet is stronger than naming the absence of a problem. "Nothing
  // is overdue" is a fact about paperwork; "All 70 machines are running" is a
  // fact about the plant, and it is the one a supervisor came to check.
  if (s.totalEquipment > 0 && s.operational === s.totalEquipment) {
    return {
      text: `All ${s.totalEquipment} machines are running${who}.`,
      lead: { href: "/schedule", label: "Open the schedule" },
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
    <PageLead
      headingId="hero-heading"
      headline={text}
      supporting={supporting(s)}
      actions={[
        { href: lead.href, label: lead.label },
        { href: "/work-orders/new", label: "Raise a work order", primary: false },
      ]}
      figure={{
        label: "Fleet availability",
        value: String(availability),
        unit: "%",
        progress: availability,
        tone: availability >= 90 ? "good" : availability >= 75 ? "warn" : "bad",
      }}
      stats={[
        { label: "down", value: s.brokenDown, tone: "bad" },
        { label: "overdue", value: s.overdue, tone: "warn" },
        { label: "to sign", value: s.awaitingSignature },
      ]}
      meta={
        <>
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
        </>
      }
    />
  );
}
