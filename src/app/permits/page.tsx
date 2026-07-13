// src/app/permits/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Loader2,
  PlusCircle,
  Clock,
  User,
  Lock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type Permit = {
  id: string;
  permitNumber: string;
  workDescription: string;
  equipmentName?: string | null;
  assetId?: string | null;
  issuedToName?: string | null;
  issuedDate?: string | null;
  expiryDate?: string | null;
  status: string;
  lotoApplied?: boolean;
  areaBarricaded?: boolean;
};

function isExpired(p: Permit) {
  if (p.status !== "ACTIVE") return false;
  if (!p.expiryDate) return false;
  return new Date(p.expiryDate).getTime() < Date.now();
}

export default function PermitsList() {
  const [records, setRecords] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  useEffect(() => {
    loadData();
  }, []);

  async function transition(id: string, status: "CLOSED" | "CANCELLED") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/permits/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast.success(`Permit ${status === "CLOSED" ? "closed out" : "cancelled"}.`);
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to update permit.");
      }
    } catch {
      toast.error("Failed to update permit.");
    } finally {
      setBusyId(null);
    }
  }

  const active = records.filter((r) => r.status === "ACTIVE" && !isExpired(r)).length;
  const expiring = records.filter((r) => isExpired(r)).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
            <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <ShieldCheck className="w-4.5 h-4.5 text-slate-950 font-bold" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900">Permits to Work</h1>
              <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">PTW Register & Safe Isolation Control</p>
            </div>
          </div>

          <Link
            href="/permits/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
          >
            <PlusCircle className="w-4.5 h-4.5" /> Raise PTW
          </Link>
        </div>

        {/* Status Tracker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Permits</p>
            <h2 className="text-2xl font-bold text-emerald-600 mt-2">{active}</h2>
          </div>
          <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Expired / Overdue</p>
            <h2 className="text-2xl font-bold text-rose-600 mt-2">{expiring}</h2>
          </div>
          <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Permits</p>
            <h2 className="text-2xl font-bold text-slate-900 mt-2">{records.length}</h2>
          </div>
        </div>

        {/* Permit List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs font-mono">Loading permit register...</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {records.length > 0 ? (
                records.map((rec) => {
                  const expired = isExpired(rec);
                  const isActive = rec.status === "ACTIVE" && !expired;
                  const statusLabel = expired ? "EXPIRED" : rec.status;
                  return (
                    <div key={rec.id} className="p-5 hover:bg-slate-50 flex items-start justify-between gap-4 transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="font-mono text-xs text-slate-500 font-semibold">{rec.permitNumber}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                              isActive
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : statusLabel === "EXPIRED"
                                ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                                : statusLabel === "CLOSED"
                                ? "bg-slate-200 text-slate-600 border-slate-300"
                                : "bg-amber-500/10 text-amber-700 border-amber-500/20"
                            }`}
                          >
                            {statusLabel}
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
                        <p className="text-xs text-slate-600 max-w-xl line-clamp-2">{rec.workDescription}</p>
                        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 font-mono">
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" /> {rec.issuedToName || "—"}
                          </div>
                          {rec.expiryDate && (
                            <div className={`flex items-center gap-1 ${expired ? "text-rose-600" : ""}`}>
                              <Clock className="w-3.5 h-3.5" /> Expires {new Date(rec.expiryDate).toLocaleString()}
                            </div>
                          )}
                        </div>
                        {expired && (
                          <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" /> Permit window has lapsed — re-validate or close out.
                          </div>
                        )}
                      </div>

                      {(rec.status === "ACTIVE") && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <button
                            onClick={() => transition(rec.id, "CLOSED")}
                            disabled={busyId === rec.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                          >
                            {busyId === rec.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Close Out
                          </button>
                          <button
                            onClick={() => transition(rec.id, "CANCELLED")}
                            disabled={busyId === rec.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No permits issued yet. Raise a PTW before any isolation work begins.
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
