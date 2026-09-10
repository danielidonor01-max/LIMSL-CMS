// src/app/work-orders/page.tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api-cache";
import { ClipboardList, Plus, Search } from "lucide-react";
import { Badge } from "@/components/Badge";
import Select from "@/components/Select";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { formatDate } from "@/lib/utils";
import LoadError from "@/components/LoadError";
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
  approvalRetrospective: boolean | null;
  approvedAt: string | null;
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
  const { data: rowsData, loading, error, refresh } = useApi<WorkOrder[]>("/api/work-orders", []);
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

  const filtersActive = q.trim() !== "" || statusFilter !== "ALL" || typeFilter !== "ALL";
  const clearFilters = () => {
    setQ("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
        <PageHeader
          title="Work Orders"
          subtitle={`${counts.OPEN ?? 0} open · ${counts.IN_PROGRESS ?? 0} in progress · ${counts.COMPLETED ?? 0} completed`}
          actions={
            <Button href="/work-orders/new" icon={Plus}>
              New Work Order
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-ink-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search WO # / equipment…"
              className="pl-8 pr-3 py-1.5 bg-ink-100 border border-ink-200 rounded-lg text-xs text-ink-900 placeholder:text-ink-500 focus:outline-none focus:border-brand-500/40 w-56"
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

        <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
          {error && !loading ? (
            <LoadError what="work orders" onRetry={refresh} />
          ) : loading ? (
            <TableSkeleton rows={7} cols={7} />
          ) : filtered.length === 0 ? (
            filtersActive ? (
              <EmptyState
                icon={Search}
                title="No work orders match these filters"
                message="There are work orders on file, but none match the current search, status and type."
                actionLabel="Clear filters"
                onAction={clearFilters}
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No work orders yet"
                message="Planned and corrective jobs will appear here once the first work order is raised."
                actionLabel="New Work Order"
                actionHref="/work-orders/new"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-3.5 px-5 font-medium">WO #</th>
                    <th className="py-3.5 px-5 font-medium">Equipment</th>
                    <th className="py-3.5 px-5 font-medium">Type</th>
                    <th className="py-3.5 px-5 font-medium">Priority</th>
                    <th className="py-3.5 px-5 font-medium">Planned</th>
                    <th className="py-3.5 px-5 font-medium">Technician</th>
                    <th className="py-3.5 px-5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-50 cursor-pointer">
                      <td className="py-3.5 px-5">
                        <Link href={`/work-orders/${r.id}`} className="font-mono text-brand-600 hover:underline">
                          {r.workOrderNumber}
                        </Link>
                      </td>
                      <td className="py-3.5 px-5">
                        <Link href={`/work-orders/${r.id}`} className="block">
                          <div className="font-medium text-ink-900 max-w-[220px] truncate">
                            {r.equipmentName}
                          </div>
                        </Link>
                        {r.assetId && (
                          <Link
                            href={`/equipment/${r.assetId.replace(/\//g, "-")}`}
                            className="text-[11px] font-mono text-ink-500 hover:text-brand-600 hover:underline"
                          >
                            {r.assetId}
                          </Link>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        <Badge className={WO_TYPE_BADGE[r.type]}>{WO_TYPE_LABELS[r.type] ?? r.type}</Badge>
                      </td>
                      <td className="py-3.5 px-5">
                        <Badge className={PRIORITY_BADGE[r.priority]}>
                          {PRIORITY_LABELS[r.priority] ?? r.priority}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-5 tabular-nums text-ink-500">{formatDate(r.plannedDate)}</td>
                      <td className="py-3.5 px-5 text-ink-700">{r.technicianName ?? "-"}</td>
                      <td className="py-3.5 px-5">
                        {r.approvalRetrospective && !r.approvedAt && (
                          <Badge className="bg-warn-500/10 text-warn-700 border-warn-500/20">
                            Unsigned emergency
                          </Badge>
                        )}
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
        <p className="text-xs text-ink-500">
          Showing {filtered.length} of {rows.length} work orders.
        </p>
      </main>
    </div>
  );
}
