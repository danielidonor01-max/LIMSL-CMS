// src/app/schedule/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  Search,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import {
  ACTIVITY_TYPE_BADGE,
  ACTIVITY_TYPE_LABELS,
  SCHEDULE_STATUS_BADGE,
  SCHEDULE_STATUS_LABELS,
  EQUIPMENT_CATEGORY_LABELS,
  MONTH_NAMES,
} from "@/lib/constants";

type ScheduleRow = {
  id: string;
  equipmentId: string;
  year: number;
  quarter: number | null;
  month: number | null;
  plannedDate: string;
  activityType: string;
  taskDescription: string | null;
  maintenanceFrequency: string | null;
  responsiblePersonName: string | null;
  status: string;
  completedDate: string | null;
  workOrderId: string | null;
  equipmentName: string | null;
  assetId: string | null;
  category: string | null;
  criticality: string | null;
  location: string | null;
};

const TODAY = new Date().toISOString().slice(0, 10);

export default function SchedulePage() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "all">("upcoming");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [quarterFilter, setQuarterFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/schedule")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  // ── KPI summary (PM only) ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const pm = rows.filter((r) => r.activityType === "PM");
    const duePM = pm.filter((r) => r.plannedDate <= TODAY);
    const completed = pm.filter((r) => r.status === "COMPLETED").length;
    const overdue = rows.filter((r) => r.status === "OVERDUE").length;
    const upcoming = rows.filter(
      (r) => r.status === "SCHEDULED" && r.plannedDate >= TODAY,
    ).length;
    const compliance = duePM.length
      ? Math.round((duePM.filter((r) => r.status === "COMPLETED").length / duePM.length) * 100)
      : 0;
    return { compliance, overdue, upcoming, completed };
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (tab === "upcoming") {
      const in60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
      out = out.filter(
        (r) => r.status !== "COMPLETED" && r.plannedDate >= TODAY && r.plannedDate <= in60,
      );
      out = [...out].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    } else {
      out = [...out].sort((a, b) => b.plannedDate.localeCompare(a.plannedDate));
    }
    if (typeFilter !== "ALL") out = out.filter((r) => r.activityType === typeFilter);
    if (statusFilter !== "ALL") out = out.filter((r) => r.status === statusFilter);
    if (quarterFilter !== "ALL") out = out.filter((r) => String(r.quarter) === quarterFilter);
    if (q.trim()) {
      const term = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.equipmentName?.toLowerCase().includes(term) ||
          r.assetId?.toLowerCase().includes(term) ||
          r.responsiblePersonName?.toLowerCase().includes(term),
      );
    }
    return out;
  }, [rows, tab, typeFilter, statusFilter, quarterFilter, q]);

  const stat = (
    label: string,
    value: string,
    icon: React.ReactNode,
    tone: string,
    sub: string,
  ) => (
    <div className={`p-4 rounded-xl border ${tone} backdrop-blur-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        <div className="p-1.5 rounded-lg bg-slate-900/50">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-bold text-white">{value}</div>
      <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      <AppHeader />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Annual Maintenance Schedule</h2>
              <p className="text-xs text-slate-400 font-mono">
                LIMSL-MAIN-PLN-013 · {new Date().getFullYear()} plan
              </p>
            </div>
          </div>
          <Link
            href="/work-orders/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all"
          >
            <Plus className="w-4 h-4" /> New Work Order
          </Link>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stat(
            "PM Compliance",
            `${summary.compliance}%`,
            <ShieldCheck className="w-4 h-4 text-emerald-400" />,
            summary.compliance >= 95
              ? "bg-emerald-500/5 border-emerald-500/15"
              : summary.compliance >= 50
                ? "bg-amber-500/5 border-amber-500/15"
                : "bg-rose-500/5 border-rose-500/15",
            "Completed ÷ due PM · target ≥95%",
          )}
          {stat(
            "Overdue",
            String(summary.overdue),
            <AlertTriangle className="w-4 h-4 text-rose-400" />,
            "bg-rose-500/5 border-rose-500/15",
            "Activities past their planned date",
          )}
          {stat(
            "Upcoming",
            String(summary.upcoming),
            <Clock className="w-4 h-4 text-sky-400" />,
            "bg-sky-500/5 border-sky-500/15",
            "Scheduled activities still ahead",
          )}
          {stat(
            "Completed",
            String(summary.completed),
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
            "bg-emerald-500/5 border-emerald-500/15",
            "PM activities signed off this year",
          )}
        </div>

        {/* Tabs + filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 bg-slate-900/40 border border-slate-800 rounded-lg p-1 w-fit">
            {(["upcoming", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tab === t
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {t === "upcoming" ? "Upcoming (60 days)" : "All Activities"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search equipment / tag…"
                className="pl-8 pr-3 py-1.5 bg-slate-900/50 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/40 w-48"
              />
            </div>
            <FilterSelect value={typeFilter} onChange={setTypeFilter} label="Type">
              <option value="ALL">All types</option>
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </FilterSelect>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Status">
              <option value="ALL">All statuses</option>
              {Object.entries(SCHEDULE_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </FilterSelect>
            <FilterSelect value={quarterFilter} onChange={setQuarterFilter} label="Quarter">
              <option value="ALL">All quarters</option>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </FilterSelect>
          </div>
        </div>

        {/* Table */}
        <div className="bg-[#0f172a]/40 border border-slate-800 rounded-xl overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center items-center text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
              <span className="text-xs ml-2 font-mono">Loading schedule…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No activities match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-3 px-4 font-medium">Planned</th>
                    <th className="py-3 px-4 font-medium">Equipment</th>
                    <th className="py-3 px-4 font-medium">Activity</th>
                    <th className="py-3 px-4 font-medium">Freq.</th>
                    <th className="py-3 px-4 font-medium">Responsible</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-900/30">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-200">{formatDate(r.plannedDate)}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.month ? MONTH_NAMES[r.month - 1] : ""} · Q{r.quarter}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200 max-w-[220px] truncate">
                          {r.equipmentName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {r.assetId} · {r.category ? EQUIPMENT_CATEGORY_LABELS[r.category] : ""}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={ACTIVITY_TYPE_BADGE[r.activityType]}>
                          {r.activityType}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {r.maintenanceFrequency?.replace(/_/g, " ").toLowerCase() ?? "—"}
                      </td>
                      <td className="py-3 px-4 text-slate-300">{r.responsiblePersonName ?? "—"}</td>
                      <td className="py-3 px-4">
                        <Badge className={SCHEDULE_STATUS_BADGE[r.status]}>
                          {SCHEDULE_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {r.workOrderId ? (
                          <Link
                            href={`/work-orders/${r.workOrderId}`}
                            className="text-emerald-400 hover:underline"
                          >
                            View WO →
                          </Link>
                        ) : (
                          <Link
                            href={`/work-orders/new?scheduleId=${r.id}`}
                            className="text-sky-400 hover:underline"
                          >
                            Raise WO
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Showing {filtered.length} of {rows.length} scheduled activities.
        </p>
      </main>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2.5 py-1.5 bg-slate-900/50 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500/40"
    >
      {children}
    </select>
  );
}
