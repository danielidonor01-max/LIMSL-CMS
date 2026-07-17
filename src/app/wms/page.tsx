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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}


      {/* Main Content */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Work Method Statements</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">WMS Library</p>
          </div>
        </div>

        <Link
          href="/wms/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
        >
          <PlusCircle className="w-5 h-5" /> Draft New WMS
        </Link>
        </div>
        {/* Status Tracker */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Draft / Under Review</p>
            <h2 className="text-2xl font-bold text-amber-600 mt-2">
              {records.filter((r) => r.status === "DRAFT" || r.status === "UNDER_REVIEW").length}
            </h2>
          </div>
          <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved & Active WMS</p>
            <h2 className="text-2xl font-bold text-emerald-600 mt-2">
              {records.filter((r) => r.status === "APPROVED").length}
            </h2>
          </div>
          <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Documents</p>
            <h2 className="text-2xl font-bold text-slate-900 mt-2">{records.length}</h2>
          </div>
        </div>

        {/* WMS Documents List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-xs font-mono">Loading WMS Database...</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {records.length > 0 ? (
                records.map((rec) => {
                  const isApproved = rec.status === "APPROVED";
                  const isUnderReview = rec.status === "UNDER_REVIEW";
                  return (
                    <div key={rec.id} className="p-5 hover:bg-slate-50 flex items-center justify-between transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-slate-500 font-semibold">{rec.wmsNumber}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${
                              isApproved
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                : isUnderReview
                                ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                : "bg-slate-200 text-slate-500 border-slate-200"
                            }`}
                          >
                            {rec.status}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">Rev {rec.revision}</span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{rec.title}</h3>
                        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500 font-mono">
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
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg text-xs font-semibold transition-all group"
                        >
                          View Document <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-slate-900 transition-colors" />
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

    </div>
  );
}
