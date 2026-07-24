// src/app/work-orders/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api-cache";
import { ClipboardList, Loader2, Plus, Search } from "lucide-react";
import { Badge } from "@/components/Badge";
import Select from "@/components/Select";
import { formatDate } from "@/lib/utils";
import {
  WO_STATUS_BADGE,
  WO_STATUS_LABELS,
  WO_TYPE_BADGE,
  WO_TYPE_LABELS,
  PRIORITY_BADGE,
  PRIORITY_LABELS,
} from "@/lib/constants";

type WorkOrder = {
  id: string;
  workOrderNumber: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  plannedDate: string | null;
  completionDate: string | null;
  technicianName: string | null;
  equipmentName: string | null;
  assetId: string | null;
  location: string | null;
};

export default function WorkOrdersPage() {
  const { data: rowsData, loading } = useApi<WorkOrder[]>("/api/work-orders", []);
  const rows = Array.isArray(rowsData) ? rowsData : [];
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const counts = useMemo(() => {
    const c: Record<string, number> = { OPEN: 0, IN_PROGRESS: 0, COMPLETED: 0, TOTAL: rows.length };
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter !== "ALL") out = out.filter((r) => r.status === statusFilter);
    if (typeFilter !== "ALL") out = out.filter((r) => r.type === typeFilter);
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.workOrderNumber.toLowerCase().includes(t) ||
          r.title.toLowerCase().includes(t) ||
          r.equipmentName?.toLowerCase().includes(t) ||
          r.assetId?.toLowerCase().includes(t),
      );
    }
    return out;
  }, [rows, statusFilter, typeFilter, q]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Work Orders</h2>
              <p className="text-xs text-slate-500 font-mono">
                {counts.OPEN ?? 0} open · {counts.IN_PROGRESS ?? 0} in progress ·{" "}
                {counts.COMPLETED ?? 0} completed
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

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search WO # / equipment…"
              className="pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/40 w-56"
            />
          </div>
          <Select
            ariaLabel="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
          >
            <option value="ALL">All statuses</option>
            {Object.entries(WO_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Select
            ariaLabel="Type"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
          >
            <option value="ALL">All types</option>
            {Object.entries(WO_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center items-center text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              <span className="text-xs ml-2 font-mono">Loading work orders…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No work orders match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 px-4 font-medium">WO #</th>
                    <th className="py-3 px-4 font-medium">Equipment</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">Priority</th>
                    <th className="py-3 px-4 font-medium">Planned</th>
                    <th className="py-3 px-4 font-medium">Technician</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 cursor-pointer">
                      <td className="py-3 px-4">
                        <Link href={`/work-orders/${r.id}`} className="font-mono text-emerald-600 hover:underline">
                          {r.workOrderNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/work-orders/${r.id}`} className="block">
                          <div className="font-medium text-slate-900 max-w-[220px] truncate">
                            {r.equipmentName}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">{r.assetId}</div>
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={WO_TYPE_BADGE[r.type]}>{WO_TYPE_LABELS[r.type] ?? r.type}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={PRIORITY_BADGE[r.priority]}>
                          {PRIORITY_LABELS[r.priority] ?? r.priority}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{formatDate(r.plannedDate)}</td>
                      <td className="py-3 px-4 text-slate-700">{r.technicianName ?? "—"}</td>
                      <td className="py-3 px-4">
                        <Badge className={WO_STATUS_BADGE[r.status]}>
                          {WO_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Showing {filtered.length} of {rows.length} work orders.
        </p>
      </main>
    </div>
  );
}
