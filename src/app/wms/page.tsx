// src/app/wms/page.tsx
"use client";

import React from "react";
import { useApi } from "@/lib/api-cache";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import {
  FileText,
  User,
  PlusCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

export default function WmsList() {
  const { data: records, loading } = useApi<any[]>("/api/wms", []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <PageHeader
          icon={FileText}
          title="Work Method Statements"
          subtitle="How each job is to be carried out safely — drafted, reviewed and approved"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <Button href="/wms/new" icon={PlusCircle}>
              Draft New WMS
            </Button>
          }
        />
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
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
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
                        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" /> Prepared:{" "}
                            <span className="font-mono">{rec.preparedDate}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-500" /> Prepared By: {rec.preparedByName}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="subtle" size="sm" href={`/wms/${rec.id}`} iconRight={ChevronRight}>
                          View Document
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No work method statements yet"
                  message="A WMS sets out how a job is to be done safely and must be approved before the work starts. Draft the first one here."
                  actionLabel="Draft New WMS"
                  actionHref="/wms/new"
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}

    </div>
  );
}
