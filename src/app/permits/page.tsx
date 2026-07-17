// src/app/permits/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  PlusCircle,
  Clock,
  User,
  Lock,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { PERMIT_ISSUE_ROLES } from "@/lib/roles";

type Permit = {
  id: string;
  permitNumber: string;
  workDescription: string;
  equipmentName?: string | null;
  assetId?: string | null;
  permitHolderName?: string | null;
  expiryDate?: string | null;
  status: string;
  lotoApplied?: boolean;
  approval?: { total: number; signed: number; complete: boolean };
};

const STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  CLOSED: "bg-slate-200 text-slate-600 border-slate-300",
  CANCELLED: "bg-slate-200 text-slate-500 border-slate-300",
  EXPIRED: "bg-rose-500/10 text-rose-600 border-rose-500/20",
};

export default function PermitsList() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const canIssue = mounted && PERMIT_ISSUE_ROLES.includes(role ?? "");

  const [records, setRecords] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    async function loadData() {
      try {
        const res = await fetch("/api/permits");
        if (res.ok) setRecords(await res.json());
      } catch (err) {
        console.error("Error loading permits:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const awaiting = records.filter((r) => r.status === "PENDING_APPROVAL").length;
  const active = records.filter((r) => r.status === "ACTIVE").length;
  const expired = records.filter((r) => r.status === "EXPIRED").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">Permits to Work</h1>
              <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">
                PTW Register · signed & approved before work begins
              </p>
            </div>
          </div>

          {canIssue && (
            <Link
              href="/permits/new"
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
            >
              <PlusCircle className="w-4.5 h-4.5" /> Raise PTW
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat label="Awaiting Sign-off" value={awaiting} text="text-amber-600" />
          <Stat label="Approved / Active" value={active} text="text-emerald-600" />
          <Stat label="Expired" value={expired} text="text-rose-600" />
          <Stat label="Total Permits" value={records.length} text="text-slate-900" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs font-mono">Loading permit register...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No permits raised yet. A PTW must be signed and approved before isolation work begins.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {records.map((rec) => {
                const pending = rec.status === "PENDING_APPROVAL";
                const signed = rec.approval?.signed ?? 0;
                const total = rec.approval?.total ?? 0;
                return (
                  <Link
                    key={rec.id}
                    href={`/permits/${rec.id}`}
                    className="p-5 hover:bg-slate-50 flex items-start justify-between gap-4 transition-colors group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-xs text-slate-500 font-semibold">{rec.permitNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${STATUS_BADGE[rec.status]}`}>
                          {rec.status.replace("_", " ")}
                        </span>
                        {rec.lotoApplied && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-700 bg-sky-500/10 border border-sky-500/20 rounded-full px-2 py-0.5">
                            <Lock className="w-3 h-3" /> LOTO
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {rec.assetId ? `${rec.assetId} — ` : ""}
                        {rec.equipmentName || "Equipment"}
                      </h3>
                      <p className="text-xs text-slate-600 max-w-xl line-clamp-1">{rec.workDescription}</p>
                      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 font-mono">
                        <div className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" /> Holder: {rec.permitHolderName || "—"}
                        </div>
                        {rec.expiryDate && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Expires {new Date(rec.expiryDate).toLocaleString()}
                          </div>
                        )}
                      </div>
                      {pending && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 font-semibold">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Work may not begin — {signed}/{total} signatures
                        </div>
                      )}
                      {rec.status === "EXPIRED" && (
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> Permit window lapsed.
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-900 shrink-0 mt-1" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <h2 className={`text-2xl font-bold mt-2 ${text}`}>{value}</h2>
    </div>
  );
}
