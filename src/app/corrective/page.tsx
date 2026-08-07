// src/app/corrective/page.tsx
"use client";

import React from "react";
import { useApi } from "@/lib/api-cache";
import LoadError from "@/components/LoadError";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import {
  AlertTriangle,
  Calendar,
  User,
  PlusCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

export default function CorrectiveMaintenanceList() {
  const { data: records, loading, error, refresh } = useApi<any[]>("/api/corrective", []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <PageHeader
          icon={AlertTriangle}
          tone="rose"
          title="Corrective Maintenance"
          subtitle="Breakdown reports, root-cause analysis and close-out"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <Button variant="danger" href="/corrective/new" icon={PlusCircle}>
              Report Machinery Fault
            </Button>
          }
        />
        {/* Statistics or Status Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Breakdowns</p>
            <h2 className="text-2xl font-bold text-rose-600 mt-2">
              {records.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS" || r.status === "PENDING_RCA").length}
            </h2>
          </div>
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Supervisor Review</p>
            <h2 className="text-2xl font-bold text-amber-600 mt-2">
              {records.filter((r) => r.status === "PENDING_APPROVAL").length}
            </h2>
          </div>
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Closed Breakdowns (2026)</p>
            <h2 className="text-2xl font-bold text-emerald-600 mt-2">
              {records.filter((r) => r.status === "CLOSED").length}
            </h2>
          </div>
        </div>

        {/* Breakdown Records List */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {error && !loading ? (
            <LoadError what="breakdown records" onRetry={refresh} />
          ) : loading ? (
            <TableSkeleton rows={5} cols={4} />
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
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 border border-rose-500/20 text-[10px] font-semibold uppercase">
                              Production Stop
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-bold text-slate-900">{rec.faultDescription || "Unnamed Fault"}</h3>
                        <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-slate-500" /> Reported:{" "}
                            <span className="font-mono">{rec.reportedDate}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-slate-500" /> By: {rec.reportedByName}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" /> Breakdown ID:{" "}
                            <span className="font-mono">{rec.breakdownId || "N/A"}</span>
                          </div>
                        </div>
                      </div>

                      <Button variant="subtle" size="sm" href={`/corrective/${rec.id}`} iconRight={ChevronRight}>
                        Action Log
                      </Button>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon={AlertTriangle}
                  title="No breakdowns logged"
                  message="Nothing has been reported as broken down. When a machine fails, report it here so the fault, its root cause and the repair are on record."
                  actionLabel="Report Machinery Fault"
                  actionHref="/corrective/new"
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
