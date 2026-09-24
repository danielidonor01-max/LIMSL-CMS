// src/app/pm-batches/page.tsx
// The PM batch register: every planned-maintenance job, and how far each one
// has got through its paperwork.
//
// A batch is the unit the shop floor actually works in — "the CNC light duties
// on the 4th" — so this is the screen that answers "is that job ready to
// start", which previously meant opening four separate modules and holding the
// answer in your head.
"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api-cache";
import { PAGE_MAIN } from "@/lib/page-shell";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/Badge";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import MetricPanel from "@/components/MetricPanel";
import SegmentedControl from "@/components/SegmentedControl";
import { Layers, CalendarClock } from "lucide-react";
import { pmFlowState } from "@/lib/maintenance/flow";

type Doc = { id: string; status: string; wmsNumber?: string; jhaNumber?: string; permitNumber?: string } | null;

type Batch = {
  id: string;
  batchNumber: string;
  title: string;
  category: string;
  categoryLabel: string;
  plannedDate: string;
  status: string;
  assignedToName?: string | null;
  machineCount: number;
  workOrdersClosed: number;
  wms: Doc;
  jha: Doc;
  permit: Doc;
};

const BATCH_STATUS_BADGE: Record<string, string> = {
  PLANNED: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  ASSIGNED: "bg-info-500/10 text-info-700 border-info-500/20",
  IN_PROGRESS: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  COMPLETED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  CANCELLED: "bg-ink-500/10 text-ink-500 border-ink-500/20",
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  ASSIGNED: "Assigned",
  IN_PROGRESS: "Work under permit",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

type Scope = "LIVE" | "DONE" | "ALL";

export default function PmBatchesPage() {
  const [mounted, setMounted] = useState(false);
  const [scope, setScope] = useState<Scope>("LIVE");
  const { data, loading } = useApi<{ batches: Batch[] }>("/api/pm-batches", { batches: [] });
  const batches = data.batches ?? [];

  useEffect(() => setMounted(true), []);

  const live = useMemo(
    () => batches.filter((b) => b.status !== "COMPLETED" && b.status !== "CANCELLED"),
    [batches],
  );
  const done = useMemo(
    () => batches.filter((b) => b.status === "COMPLETED" || b.status === "CANCELLED"),
    [batches],
  );
  const rows = scope === "LIVE" ? live : scope === "DONE" ? done : batches;

  // A batch is only permitted when the permit exists and has not been refused,
  // which is the same test the flow engine applies.
  const permitted = batches.filter((b) => pmFlowState({
    batchId: b.id,
    assignedToId: b.assignedToName ? "x" : null,
    workOrderCount: b.machineCount,
    wmsStatus: b.wms?.status,
    jhaStatus: b.jha?.status,
    permitStatus: b.permit?.status,
  }).done.includes("PERMIT")).length;

  const unassigned = batches.filter((b) => !b.assignedToName && b.status !== "COMPLETED").length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="PM Batches"
          subtitle="Machines due together are one job, with one method statement, one hazard analysis and one permit"
          backHref="/schedule"
          backLabel="Schedule"
        />

        <MetricPanel
          label="Planned maintenance"
          metrics={[
            {
              key: "live",
              label: "In flight",
              count: live.length,
              value: String(live.length),
              status: "plain",
              description: "Raised and not yet finished",
            },
            {
              key: "unassigned",
              label: "Nobody assigned",
              count: unassigned,
              value: String(unassigned),
              status: unassigned > 0 ? "warning" : "plain",
              description: "Cannot proceed until somebody owns them",
            },
            {
              key: "permitted",
              label: "Permitted",
              count: permitted,
              value: String(permitted),
              status: "plain",
              description: "Work may proceed under a permit",
            },
            {
              key: "done",
              label: "Completed",
              count: done.length,
              value: String(done.length),
              status: "plain",
            },
          ]}
        />

        <SegmentedControl
          ariaLabel="Batch scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: "LIVE", label: "In flight", count: live.length },
            { value: "DONE", label: "Finished", count: done.length },
            { value: "ALL", label: "All", count: batches.length },
          ]}
        />

        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {!mounted || loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={batches.length === 0 ? "No PM batches raised yet" : "Nothing here"}
              message={
                batches.length === 0
                  ? "A batch is raised from the schedule, where machines of one category fall due on the same date."
                  : scope === "LIVE"
                    ? "Every batch has been finished."
                    : "No batch has been finished yet."
              }
              blockedBy={
                batches.length === 0 ? { label: "Open the schedule", href: "/schedule" } : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-500 text-xs">
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Batch</th>
                    <th className="py-2.5 px-4 font-medium">Category</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Planned</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Machines</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Assigned to</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Documents</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {rows.map((b) => (
                    <tr key={b.id} className="hover:bg-ink-50 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Link
                          href={`/pm-batches/${b.id}`}
                          className="font-semibold text-ink-900 hover:text-brand-700"
                        >
                          {b.batchNumber}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-ink-700">{b.categoryLabel}</td>
                      <td className="py-3 px-4 whitespace-nowrap text-ink-600 tabular-nums">
                        {formatDate(b.plannedDate)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-ink-600 tabular-nums">
                        {b.workOrdersClosed}/{b.machineCount}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {b.assignedToName ? (
                          <span className="text-ink-700">{b.assignedToName}</span>
                        ) : (
                          <span className="text-warn-700 font-medium">Nobody yet</span>
                        )}
                      </td>
                      {/* Three letters, each lit only when that document is
                          approved. This is the column somebody scans to find
                          the job that is one signature away from starting. */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-flex gap-1">
                          {(
                            [
                              ["WMS", b.wms?.status === "APPROVED"],
                              ["JHA", b.jha?.status === "APPROVED"],
                              ["PTW", !!b.permit && b.permit.status !== "REJECTED"],
                            ] as Array<[string, boolean]>
                          ).map(([label, on]) => (
                            <span
                              key={label}
                              title={`${label} ${on ? "in place" : "not yet"}`}
                              className={`text-xs font-semibold px-1.5 py-0.5 rounded border ${
                                on
                                  ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                                  : "bg-ink-500/5 text-ink-400 border-ink-200"
                              }`}
                            >
                              {label}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge className={BATCH_STATUS_BADGE[b.status] ?? BATCH_STATUS_BADGE.PLANNED}>
                          {BATCH_STATUS_LABELS[b.status] ?? b.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-xs text-ink-500 flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" />
          Batches are raised from the schedule, where the annual plan says which category falls due on
          which date.
        </p>
      </main>
    </div>
  );
}
