// src/app/wms/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  FileText,
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

export default function WmsList() {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/wms");
        if (res.ok) {
          const data = await res.json();
          setRecords(data);
        }
      } catch (err) {
        console.error("Error loading WMS documents:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <FileText className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Work Method Statements</h1>
            <p className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase">WMS Library</p>
          </div>
        </div>

        <Link
          href="/wms/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
        >
          <PlusCircle className="w-4.5 h-4.5" /> Draft New WMS
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Status Tracker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Draft / Under Review</p>
            <h2 className="text-2xl font-bold text-amber-400 mt-2">
              {records.filter((r) => r.status === "DRAFT" || r.status === "UNDER_REVIEW").length}
            </h2>
          </div>
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved & Active WMS</p>
            <h2 className="text-2xl font-bold text-emerald-400 mt-2">
              {records.filter((r) => r.status === "APPROVED").length}
            </h2>
          </div>
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Documents</p>
            <h2 className="text-2xl font-bold text-slate-200 mt-2">{records.length}</h2>
          </div>
        </div>

        {/* WMS Documents List */}
        <div className="bg-[#0f172a]/20 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <p className="text-xs font-mono">Loading WMS Database...</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/40">
              {records.length > 0 ? (
                records.map((rec) => {
                  const isApproved = rec.status === "APPROVED";
                  const isUnderReview = rec.status === "UNDER_REVIEW";
                  return (
                    <div key={rec.id} className="p-5 hover:bg-slate-900/10 flex items-center justify-between transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-slate-400 font-semibold">{rec.wmsNumber}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                              isApproved
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                : isUnderReview
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                : "bg-slate-800 text-slate-400 border-slate-750"
                            }`}
                          >
                            {rec.status}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Rev {rec.revision}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-200">{rec.title}</h3>
                        <div className="flex flex-wrap gap-4 text-[11px] text-slate-400 font-mono">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" /> Prepared: {rec.preparedDate}
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-500" /> Prepared By: {rec.preparedByName}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Link
                          href={`/wms/${rec.id}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 rounded-lg text-xs font-semibold transition-all group"
                        >
                          View Document <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                        </Link>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No Work Method Statements logged.
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 px-6 text-center text-[10px] text-slate-500 font-mono">
        &copy; {new Date().getFullYear()} Lee International Machinery and Services Limited. | Quality Assurance Department.
      </footer>
    </div>
  );
}
