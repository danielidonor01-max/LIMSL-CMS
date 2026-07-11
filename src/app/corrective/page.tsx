// src/app/corrective/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Calendar,
  User,
  PlusCircle,
  FileCheck,
  CheckCircle2,
  Clock,
  ChevronRight,
} from "lucide-react";

export default function CorrectiveMaintenanceList() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/corrective");
        if (res.ok) {
          const data = await res.json();
          setRecords(data);
        }
      } catch (err) {
        console.error("Error loading corrective logs:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}


      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center">
            <AlertTriangle className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Corrective Maintenance</h1>
            <p className="text-[10px] text-rose-600 font-mono tracking-wider uppercase">CMRF & RCA Log</p>
          </div>
        </div>

        <Link
          href="/corrective/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-rose-950/20"
        >
          <PlusCircle className="w-4.5 h-4.5" /> Report Machinery Fault
        </Link>
        </div>
        {/* Statistics or Status Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-rose-500/5 border border-rose-500/15 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Breakdowns</p>
            <h2 className="text-2xl font-bold text-rose-600 mt-2">
              {records.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS" || r.status === "PENDING_RCA").length}
            </h2>
          </div>
          <div className="p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Supervisor Review</p>
            <h2 className="text-2xl font-bold text-amber-600 mt-2">
              {records.filter((r) => r.status === "PENDING_APPROVAL").length}
            </h2>
          </div>
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closed Breakdowns (2026)</p>
            <h2 className="text-2xl font-bold text-emerald-600 mt-2">
              {records.filter((r) => r.status === "CLOSED").length}
            </h2>
          </div>
        </div>

        {/* Breakdown Records List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-rose-600" />
              <p className="text-xs font-mono">Loading Corrective Maintenance Database...</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {records.length > 0 ? (
                records.map((rec) => {
                  const isOpen = rec.status === "OPEN";
                  const isClosed = rec.status === "CLOSED";
                  const isRcaPending = rec.status === "PENDING_RCA" || (isOpen && !rec.rcaTool);
                  return (
                    <div key={rec.id} className="p-5 hover:bg-slate-50 flex items-center justify-between transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-rose-600 font-semibold">{rec.cmrfNumber}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                              isClosed
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : isRcaPending
                                ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                : "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            }`}
                          >
                            {isClosed ? "Resolved" : isRcaPending ? "RCA Investigation" : "Open Breakdown"}
                          </span>
                          {rec.urgency === "CRITICAL" && (
                            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-700 border border-rose-900 text-[8px] font-black uppercase">
                              Production Stop
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{rec.faultDescription || "Unnamed Fault"}</h3>
                        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 font-mono">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" /> Reported: {rec.reportedDate}
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-500" /> By: {rec.reportedByName}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" /> Breakdown ID: {rec.breakdownId || "N/A"}
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/corrective/${rec.id}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold transition-all group"
                      >
                        Action Log <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-900 transition-colors" />
                      </Link>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No machinery breakdowns or corrective reports currently logged.
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}

    </div>
  );
}
