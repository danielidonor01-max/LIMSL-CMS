// src/app/equipment/scan/[assetId]/page.tsx
// The machine passport, as read on a phone at the machine.
//
// The reader is a welder who has noticed something wrong, standing in front of
// a running workshop, holding a phone in a glove. They have one question and it
// is not "what is the sub-category of this asset". It is: can I touch this.
//
// So the page answers that in the first thing they see, in a full sentence, and
// everything else is quiet underneath it. One bold thing per screen, the same
// rule the dashboard and the KPI page follow.
//
// Light, not dark. The previous version was near-black with tracked-out capital
// labels and monospace on every caption, which is a look rather than a reading
// aid: 17  labels, 22 monospace spans and 17 captions below the 11px
// floor the rest of the app keeps. Phones also reach their highest brightness
// on light backgrounds, which is what matters in a workshop with the doors open.
"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Phone, ShieldCheck, ShieldAlert, Lock, ArrowUpRight } from "lucide-react";
import Button from "@/components/Button";
import { formatDate } from "@/lib/utils";
import { contactKindLabel } from "@/lib/hse/emergency-contact-kinds";

interface ScanData {
  signedIn: boolean;
  equipment: {
    id: string;
    assetId: string;
    name: string;
    category: string;
    categoryLabel: string;
    location?: string | null;
    bay?: string | null;
    status: string;
    statusLabel: string;
  };
  safety: {
    isSafeToOperate: boolean;
    hasLoto: boolean;
    activePermitCount: number;
    recommendedPPE: string[];
  };
  contacts: Array<{
    name: string;
    organisation?: string | null;
    kind: string;
    phone: string;
  }>;
  details: {
    oem?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    subCategory?: string | null;
    criticality?: string | null;
    commissioningDate?: string | null;
    lastMaintenanceDate?: string | null;
    nextMaintenanceDate?: string | null;
    maintenanceFrequency?: string | null;
    requiresCalibration?: boolean | null;
  } | null;
}

// The verdict, in the words somebody would use out loud. Not "status:
// OPERATIONAL", which is a database value wearing a label.
function verdict(d: ScanData): { headline: string; detail: string; safe: boolean } {
  const { safety, equipment } = d;

  if (safety.hasLoto) {
    return {
      safe: false,
      headline: "Do not touch this machine.",
      detail:
        "It is locked out and tagged out. Somebody is working on it and has isolated it deliberately. Do not energise it, operate it, or remove any isolation.",
    };
  }
  if (safety.activePermitCount > 0) {
    return {
      safe: false,
      headline: "Work is under way on this machine.",
      detail:
        safety.activePermitCount === 1
          ? "A permit to work is live. Find the permit holder before going near it."
          : `${safety.activePermitCount} permits to work are live. Find the permit holders before going near it.`,
    };
  }
  if (equipment.status === "BROKEN_DOWN") {
    return {
      safe: false,
      headline: "This machine is broken down.",
      detail: "It has been taken out of service. Do not attempt to run it.",
    };
  }
  if (equipment.status !== "OPERATIONAL") {
    return {
      safe: false,
      headline: `This machine is ${equipment.statusLabel.toLowerCase()}.`,
      detail: "It is not cleared for normal operation. Speak to your supervisor before using it.",
    };
  }
  return {
    safe: true,
    headline: "This machine is cleared to operate.",
    detail:
      "No lockout is applied and no permit is live against it. Wear the protective equipment below, and report anything that looks wrong.",
  };
}

export default function MachinePassportPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = use(params);
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/equipment/scan/${assetId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-ink-500 gap-2 text-sm">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" /> Reading the machine record…
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-6 text-center gap-3">
        <h1 className="text-3xl font-bold text-ink-900">That tag is not on the register</h1>
        <p className="text-sm text-ink-600 max-w-sm leading-relaxed">
          The code scanned as <span className="tabular-nums font-semibold">{assetId.replace(/-/g, "/")}</span>,
          and no machine on the register carries it. Tell your supervisor which machine the sticker
          is on.
        </p>
      </div>
    );
  }

  const { equipment: eq, safety, contacts, details, signedIn } = data;
  const v = verdict(data);

  return (
    <div className="min-h-screen bg-canvas text-ink-900 font-sans">
      {/* A line of identification, not a branded chrome bar. */}
      <header className="bg-surface border-b border-line">
        <div className="max-w-lg mx-auto px-5 py-3 flex items-center gap-2.5">
          <Image src="/brand/logo-80.png" alt="" width={24} height={24} className="w-6 h-6 shrink-0" />
          <span className="text-sm font-semibold tracking-tight">LEE International</span>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-5 py-6 space-y-5">
        {/* The machine, quietly, above the answer about it. */}
        <div>
          <p className="text-sm text-ink-600 tabular-nums">{eq.assetId}</p>
          <h1 className="text-3xl font-bold tracking-[-0.02em] leading-tight mt-0.5">{eq.name}</h1>
          <p className="text-sm text-ink-600 mt-1">
            {eq.categoryLabel}
            {eq.location ? ` · ${eq.location}` : ""}
            {eq.bay ? ` · ${eq.bay}` : ""}
          </p>
        </div>

        {/* The one bold thing. Dark because it is the single fact worth reading
            across a workshop, the same treatment the dashboard gives fleet
            availability. Everything below it stays quiet. */}
        <section
          className={`rounded-2xl p-6 ${v.safe ? "bg-nav text-white" : "bg-danger-600 text-white"}`}
          aria-live="polite"
        >
          {/* The icon sits above rather than beside. On a 390px phone a 24px
              glyph and its gap take a tenth of the line, which pushed the
              headline onto a third line for no reading benefit. */}
          {v.safe ? (
            <ShieldCheck className="w-7 h-7" />
          ) : (
            <ShieldAlert className="w-7 h-7" />
          )}
          <h2 className="text-3xl font-bold tracking-[-0.02em] leading-[1.12] text-balance mt-3">
            {v.headline}
          </h2>
          <p className="text-sm mt-2.5 leading-relaxed opacity-90">{v.detail}</p>
        </section>

        {/* PPE. Chips, because it is a list of things to put on, not prose. */}
        <section className="bg-surface border border-line rounded-2xl shadow-card p-5">
          <h3 className="text-base font-semibold">Wear this near the machine</h3>
          <div className="flex flex-wrap gap-2 mt-3">
            {safety.recommendedPPE.map((ppe) => (
              <span
                key={ppe}
                className="text-sm font-medium px-3 py-1.5 rounded-lg bg-ink-100 border border-ink-200 text-ink-800"
              >
                {ppe}
              </span>
            ))}
          </div>
          <p className="text-xs text-ink-500 mt-3 leading-relaxed">
            The standard kit for this type of machine. The permit for a specific job may require
            more, and it takes precedence.
          </p>
        </section>

        {/* Contacts. Full-width dial buttons, because this is read one-handed by
            somebody who may already be dealing with the emergency. */}
        <section className="bg-surface border border-line rounded-2xl shadow-card p-5">
          <h3 className="text-base font-semibold">If something goes wrong</h3>
          {contacts.length === 0 ? (
            <p className="text-sm text-ink-600 mt-2 leading-relaxed">
              No emergency contacts have been recorded yet. Nothing is invented here on purpose: a
              wrong number on this page would be discovered by whoever dialled it. Raise the alarm
              the way your site procedure says.
            </p>
          ) : (
            <div className="space-y-2 mt-3">
              {contacts.map((c) => (
                // Stacked, not side by side. On a 390px phone a name like
                // "Lagos State Fire Service" beside a number wraps to one word
                // per line, and the number is the thing being reached for.
                <a
                  key={c.phone}
                  href={`tel:${c.phone.replace(/\s+/g, "")}`}
                  className="block rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 hover:bg-danger-100 transition-colors"
                >
                  <span className="block text-sm font-semibold text-danger-800">{c.name}</span>
                  <span className="block text-xs text-danger-700/80 mt-0.5">
                    {contactKindLabel(c.kind)}
                    {c.organisation ? ` · ${c.organisation}` : ""}
                  </span>
                  <span className="flex items-center gap-2 text-xl font-semibold text-danger-800 tabular-nums mt-1.5">
                    <Phone className="w-5 h-5 shrink-0" />
                    {c.phone}
                  </span>
                </a>
              ))}
            </div>
          )}
        </section>

        {/* The rest of the record, once there is a person behind the request. */}
        {details ? (
          <section className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
            <h3 className="text-base font-semibold px-5 pt-5">Machine record</h3>
            <dl className="mt-3 divide-y divide-line">
              {[
                ["Manufacturer", details.oem],
                ["Model", details.model],
                ["Serial number", details.serialNumber],
                ["Criticality", details.criticality],
                ["Last serviced", details.lastMaintenanceDate ? formatDate(details.lastMaintenanceDate) : null],
                ["Next service due", details.nextMaintenanceDate ? formatDate(details.nextMaintenanceDate) : null],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={String(label)} className="flex items-baseline justify-between gap-4 px-5 py-3">
                    <dt className="text-sm text-ink-600">{label}</dt>
                    <dd className="text-sm font-medium text-ink-900 text-right tabular-nums">{value}</dd>
                  </div>
                ))}
            </dl>
            <div className="px-5 py-4 border-t border-line">
              <Button href={`/equipment/${assetId}`} iconRight={ArrowUpRight} variant="secondary">
                Open the full record
              </Button>
            </div>
          </section>
        ) : (
          <section className="bg-surface border border-line rounded-2xl shadow-card p-5">
            <div className="flex items-start gap-3">
              <Lock className="w-4 h-4 text-ink-400 shrink-0 mt-1" />
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Signed in, there is more</h3>
                <p className="text-sm text-ink-600 mt-1.5 leading-relaxed">
                  The service history, the make and model, the permits against this machine, and the
                  ability to raise a fault report. Everything above stays available without an
                  account.
                </p>
                <div className="mt-4">
                  <Button href={`/login?callbackUrl=/equipment/${assetId}`} iconRight={ArrowUpRight}>
                    Sign in
                  </Button>
                </div>
              </div>
            </div>
          </section>
        )}

        <p className="text-xs text-ink-500 text-center leading-relaxed pt-1">
          {signedIn ? "Signed in." : "Scanned from the tag on this machine."} Report anything that
          looks, sounds or smells wrong, however small.
        </p>
      </main>
    </div>
  );
}
