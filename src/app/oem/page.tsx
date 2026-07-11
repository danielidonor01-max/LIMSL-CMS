// src/app/oem/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Loader2,
  ShieldCheck,
  ShieldX,
  Phone,
  Mail,
  Clock,
  Package,
  AlertTriangle,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";

type Vendor = {
  id: string;
  vendorName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  warrantyStart: string | null;
  warrantyEnd: string | null;
  warrantyScope: string | null;
  warrantyActive: boolean | null;
  avgResponseTimeHrs: number | null;
  avgSpareLeadTimeDays: number | null;
  equipmentName: string | null;
  assetId: string | null;
};

type Intervention = {
  id: string;
  interventionDate: string;
  problemDescription: string | null;
  warrantyStatus: string | null;
  responseTimeHrs: number | null;
  resolutionSummary: string | null;
  closed: boolean | null;
};

const TODAY = new Date().toISOString().slice(0, 10);
const daysUntil = (d: string | null) =>
  d ? Math.round((new Date(d).getTime() - Date.now()) / 864e5) : null;

export default function OemPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/oem")
      .then((r) => r.json())
      .then((d) => {
        setVendors(d.vendors ?? []);
        setInterventions(d.interventions ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const active = vendors.filter((v) => v.warrantyActive && (v.warrantyEnd ?? "") >= TODAY).length;
    const expiringSoon = vendors.filter((v) => {
      const d = daysUntil(v.warrantyEnd);
      return d !== null && d >= 0 && d <= 60;
    }).length;
    const expired = vendors.filter((v) => (v.warrantyEnd ?? "") < TODAY).length;
    return { active, expiringSoon, expired, total: vendors.length };
  }, [vendors]);

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      <AppHeader />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">OEM & Warranty Management</h2>
            <p className="text-xs text-slate-400 font-mono">Vendors · warranty · spare-part lead times</p>
          </div>
        </div>

        {loading ? (
          <div className="py-24 flex justify-center items-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            <span className="text-xs ml-2 font-mono">Loading OEM data…</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Vendors" value={String(summary.total)} tone="border-slate-800 bg-slate-900/30" text="text-slate-200" />
              <Stat label="Active Warranty" value={String(summary.active)} tone="border-emerald-500/15 bg-emerald-500/5" text="text-emerald-400" />
              <Stat label="Expiring ≤60d" value={String(summary.expiringSoon)} tone="border-amber-500/15 bg-amber-500/5" text="text-amber-400" />
              <Stat label="Expired" value={String(summary.expired)} tone="border-rose-500/15 bg-rose-500/5" text="text-rose-400" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {vendors.map((v) => {
                const days = daysUntil(v.warrantyEnd);
                const active = !!v.warrantyActive && (v.warrantyEnd ?? "") >= TODAY;
                return (
                  <div key={v.id} className="bg-[#0f172a]/40 border border-slate-800 rounded-xl p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-100">{v.vendorName}</h3>
                        <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {v.equipmentName} · {v.assetId}
                        </p>
                      </div>
                      {active ? (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          <ShieldCheck className="w-3 h-3 mr-1" /> In Warranty
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20">
                          <ShieldX className="w-3 h-3 mr-1" /> Out of Warranty
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {v.phone ?? "—"}</span>
                      <span className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {v.email ?? "—"}</span>
                      <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> {v.avgResponseTimeHrs ?? "—"} hr response</span>
                      <span className="flex items-center gap-1.5"><Package className="w-3 h-3" /> {v.avgSpareLeadTimeDays ?? "—"} d lead</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[11px]">
                      <span className="text-slate-500">{v.warrantyScope}</span>
                      <span className={active ? "text-emerald-400" : "text-rose-400"}>
                        {active && days !== null
                          ? `${days}d left · ${formatDate(v.warrantyEnd)}`
                          : `Expired ${formatDate(v.warrantyEnd)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interventions */}
            <div className="bg-[#0f172a]/40 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-200">OEM Intervention Log</h3>
              </div>
              {interventions.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-sm">No OEM interventions logged.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-5 font-medium">Date</th>
                        <th className="py-2.5 px-4 font-medium">Problem</th>
                        <th className="py-2.5 px-4 font-medium">Warranty</th>
                        <th className="py-2.5 px-4 font-medium">Response</th>
                        <th className="py-2.5 px-4 font-medium">Resolution</th>
                        <th className="py-2.5 px-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {interventions.map((it) => (
                        <tr key={it.id} className="hover:bg-slate-900/30">
                          <td className="py-2.5 px-5 font-mono text-slate-400">{formatDate(it.interventionDate)}</td>
                          <td className="py-2.5 px-4 text-slate-300 max-w-xs">{it.problemDescription}</td>
                          <td className="py-2.5 px-4">
                            <Badge className={it.warrantyStatus === "IN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-slate-500/10 text-slate-400 border-slate-500/20"}>
                              {it.warrantyStatus ?? "—"}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 text-slate-300">{it.responseTimeHrs ?? "—"} hrs</td>
                          <td className="py-2.5 px-4 text-slate-400 max-w-xs">{it.resolutionSummary}</td>
                          <td className="py-2.5 px-4">
                            <Badge className={it.closed ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}>
                              {it.closed ? "Closed" : "Open"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone, text }: { label: string; value: string; tone: string; text: string }) {
  return (
    <div className={`p-4 rounded-xl border ${tone}`}>
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <div className={`text-2xl font-bold mt-2 ${text}`}>{value}</div>
    </div>
  );
}
