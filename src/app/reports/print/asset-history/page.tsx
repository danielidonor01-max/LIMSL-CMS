// src/app/reports/print/asset-history/page.tsx
// The per-asset maintenance dossier, printed. Same letterhead and sign-off block
// as the other ISO evidence registers, but the body is a machine's identity plus
// one chronological record set for the requested window, what an auditor asks
// for when they pick a machine off the shop floor and say "show me this one".
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ArrowLeft, Download, Loader2, Printer, Wrench } from "lucide-react";
import Button from "@/components/Button";
import { downloadCSV } from "@/lib/export";
import { formatDate } from "@/lib/utils";
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
  FREQUENCY_LABELS,
  CRITICALITY_SHORT,
} from "@/lib/constants";

type DossierEvent = {
  date: string;
  category: string;
  reference: string;
  title: string;
  detail: string;
  performedBy: string;
  state: string;
  href: string | null;
};

type Dossier = {
  generatedAt: string;
  range: { from: string; to: string };
  equipment: Record<string, string | boolean | null>;
  totals: Record<string, number | null>;
  events: DossierEvent[];
};

function AssetHistoryDossier() {
  const params = useSearchParams();
  const { data: session } = useSession();
  const assetId = params.get("assetId") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const [data, setData] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      setError("No asset was selected.");
      setLoading(false);
      return;
    }
    const qs = new URLSearchParams({ assetId });
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    setLoading(true);
    fetch(`/api/reports/asset-history?${qs.toString()}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.error ?? "Failed to load the dossier.");
        return body as Dossier;
      })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [assetId, from, to]);

  const csvRows = useMemo(
    () =>
      (data?.events ?? []).map((e) => ({
        Date: e.date,
        Category: e.category,
        Reference: e.reference,
        Record: e.title,
        Detail: e.detail,
        "Performed by": e.performedBy,
        "Status / approval": e.state,
      })),
    [data],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-10 text-center">
        <p className="text-sm font-semibold text-slate-700">{error ?? "Dossier unavailable."}</p>
        <Button variant="secondary" href="/reports" icon={ArrowLeft}>
          Back to reports
        </Button>
      </div>
    );
  }

  const eq = data.equipment;
  const t = data.totals;
  const availability = t.availability == null ? ", " : `${(t.availability * 100).toFixed(1)}%`;
  const identity: [string, string][] = [
    ["Asset ID", String(eq.assetId ?? "-")],
    ["Equipment", String(eq.name ?? "-")],
    ["Category", EQUIPMENT_CATEGORY_LABELS[String(eq.category)] ?? String(eq.category ?? "-")],
    ["OEM", String(eq.oem ?? "-")],
    ["Model", String(eq.model ?? "-")],
    ["Serial number", String(eq.serialNumber ?? "-")],
    ["Location", [eq.location, eq.bay].filter(Boolean).join(" · ") || "-"],
    ["Criticality", CRITICALITY_SHORT[String(eq.criticality)] ?? String(eq.criticality ?? "-")],
    ["Commissioned", eq.commissioningDate ? formatDate(String(eq.commissioningDate)) : ", "],
    ["Warranty expiry", eq.warrantyExpiry ? formatDate(String(eq.warrantyExpiry)) : ", "],
    ["Service interval", FREQUENCY_LABELS[String(eq.maintenanceFrequency ?? "")] ?? String(eq.maintenanceFrequency ?? "-")],
    ["Current status", EQUIPMENT_STATUS_LABELS[String(eq.status)] ?? String(eq.status ?? "-")],
  ];

  const summary: [string, string][] = [
    ["PM checklists filed", `${t.pmChecklists ?? 0}${t.pmChecklistsCompleted != null ? ` (${t.pmChecklistsCompleted} completed)` : ""}`],
    ["Preventive work orders", String(t.pmWorkOrders ?? 0)],
    ["Breakdowns", `${t.breakdowns ?? 0}${t.breakdownsOpen ? ` (${t.breakdownsOpen} open)` : ""}`],
    ["Total downtime", `${t.downtimeHours ?? 0} h`],
    ["Planned production hours", `${t.plannedHours ?? 0} h`],
    ["Availability", availability],
    ["Non-conformities", `${t.nonConformities ?? 0}${t.nonConformitiesOpen ? ` (${t.nonConformitiesOpen} open)` : ""}`],
    ["Calibrations", `${t.calibrations ?? 0}${t.calibrationFailures ? ` (${t.calibrationFailures} failed)` : ""}`],
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white">
      {/* Toolbar (hidden on print) */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            icon={Download}
            onClick={() =>
              downloadCSV(`limsl-asset-history-${String(eq.assetId ?? "asset").replace(/\//g, "-")}`, csvRows)
            }
          >
            CSV
          </Button>
          <Button icon={Printer} onClick={() => window.print()}>
            Print / Save PDF
          </Button>
        </div>
      </div>

      <main className="max-w-5xl w-full mx-auto p-6 print:p-0 print:max-w-none">
        <div className="bg-white border border-slate-200 rounded-xl p-8 print:border-0 print:rounded-none print:p-0 space-y-6">
          {/* Letterhead */}
          <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-slate-900 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-slate-900 leading-none">
                  LEE INTERNATIONAL
                </h1>
                <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest mt-1">
                  Machinery &amp; Services Limited
                </p>
              </div>
            </div>
            <div className="text-right text-[10px] text-slate-500 font-mono">
              <p className="font-bold text-slate-900">LIMSL-RPT-ASSET</p>
              <p>ISO 9001:2015 · ISO 45001</p>
            </div>
          </div>

          {/* Title + generated stamp */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              Maintenance Dossier, {String(eq.assetId ?? "")} {eq.name ? `· ${eq.name}` : ""}
            </h2>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              {formatDate(data.range.from)}, {formatDate(data.range.to)} · generated{" "}
              {new Date(data.generatedAt).toLocaleString()} · by {session?.user?.name ?? "-"} ·{" "}
              {data.events.length} record{data.events.length === 1 ? "" : "s"}
            </p>
          </div>

          {/* Equipment identity */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider mb-2">
              Equipment identity
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 print:grid-cols-4 gap-x-6 gap-y-2 border border-slate-200 rounded-lg p-4 print:rounded-none">
              {identity.map(([label, value]) => (
                <div key={label}>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</p>
                  <p className="text-[11px] text-slate-900 font-medium break-words">{value || "-"}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Period summary */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider mb-2">
              Period summary
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2 bg-slate-50 border border-slate-200 rounded-lg p-4 print:rounded-none">
              {summary.map(([label, value]) => (
                <div key={label}>
                  <p className="text-[9px] text-slate-500 uppercase tracking-wider">{label}</p>
                  <p className="text-[11px] text-slate-900 font-semibold">{value}</p>
                </div>
              ))}
            </div>
            {!!t.downtimeUnrecorded && (
              <p className="text-[10px] text-amber-700 mt-2">
                {t.downtimeUnrecorded} breakdown{t.downtimeUnrecorded === 1 ? "" : "s"} in this period have no recorded
                downtime window, availability above is an upper bound.
              </p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">
              Availability = (planned production hours − recorded downtime) ÷ planned production hours, using the
              organisation&apos;s working-hours calendar.
            </p>
          </div>

          {/* Chronological record set */}
          <div>
            <h3 className="text-[11px] font-bold text-slate-900 uppercase tracking-wider mb-2">
              Chronological maintenance record
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-300 text-slate-600">
                    <th className="py-2 pr-3 font-semibold uppercase tracking-wide whitespace-nowrap">Date</th>
                    <th className="py-2 pr-3 font-semibold uppercase tracking-wide">Type</th>
                    <th className="py-2 pr-3 font-semibold uppercase tracking-wide">Reference</th>
                    <th className="py-2 pr-3 font-semibold uppercase tracking-wide">Record</th>
                    <th className="py-2 pr-3 font-semibold uppercase tracking-wide">Performed by</th>
                    <th className="py-2 font-semibold uppercase tracking-wide">Status / approval</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {data.events.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        No maintenance records in this period.
                      </td>
                    </tr>
                  ) : (
                    data.events.map((e, i) => (
                      <tr key={`${e.date}-${e.reference}-${i}`} className="text-slate-800 break-inside-avoid align-top">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{formatDate(e.date)}</td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{e.category}</td>
                        <td className="py-1.5 pr-3 font-mono text-[10px]">{e.reference || "-"}</td>
                        <td className="py-1.5 pr-3">
                          <span className="font-semibold">{e.title}</span>
                          {e.detail && <span className="block text-slate-500">{e.detail}</span>}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{e.performedBy || "-"}</td>
                        <td className="py-1.5">{e.state || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Auditor sign-off block */}
          <div className="grid grid-cols-3 gap-6 pt-10 text-[11px]">
            {["Prepared by", "Reviewed by (QA/QC)", "Approved by"].map((label) => (
              <div key={label}>
                <div className="border-b border-slate-400 h-8" />
                <p className="text-slate-600 mt-1">{label}</p>
                <p className="text-slate-400">Name / Signature / Date</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function AssetHistoryPrintPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        </div>
      }
    >
      <AssetHistoryDossier />
    </Suspense>
  );
}
