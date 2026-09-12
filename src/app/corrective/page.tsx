// src/app/corrective/page.tsx
"use client";

import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/Badge";
import { useApi } from "@/lib/api-cache";
import LoadError from "@/components/LoadError";
import Button from "@/components/Button";
import MetricPanel from "@/components/MetricPanel";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { AlertTriangle, PlusCircle, ChevronRight } from "lucide-react";

export default function CorrectiveMaintenanceList() {
  const { data: records, loading, error, refresh } = useApi<any[]>("/api/corrective", []);

  const activeCount = records.filter(
    (r) => r.status === "OPEN" || r.status === "IN_PROGRESS" || r.status === "PENDING_RCA",
  ).length;
  const reviewCount = records.filter((r) => r.status === "PENDING_APPROVAL").length;
  const closedCount = records.filter((r) => r.status === "CLOSED").length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
        <PageHeader
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
        {/* One panel rather than three tinted cards. The tints stayed coloured
            at zero, so an empty "Pending review" card read as urgent from across
            the room and the three of them blurred into one another. */}
        <MetricPanel
          columns={3}
          label="Breakdown status"
          metrics={[
            {
              key: "active",
              label: "Active breakdowns",
              count: activeCount,
              value: String(activeCount),
              status: "danger",
              description: "Reported and not yet closed out",
            },
            {
              key: "review",
              label: "Pending supervisor review",
              count: reviewCount,
              value: String(reviewCount),
              status: "warning",
              description: "Repaired, waiting on a signature",
            },
            {
              key: "closed",
              label: "Closed this year",
              count: closedCount,
              value: String(closedCount),
              status: "plain",
              description: "Signed off with the root cause recorded",
            },
          ]}
        />

        {/* Breakdown Records List */}
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {error && !loading ? (
            <LoadError what="breakdown records" onRetry={refresh} />
          ) : loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : (
            <div className="divide-y divide-ink-200">
              {records.length > 0 ? (
                records.map((rec) => {
                  const isOpen = rec.status === "OPEN";
                  const isClosed = rec.status === "CLOSED";
                  const isRcaPending = rec.status === "PENDING_RCA" || (isOpen && !rec.rcaTool);
                  return (
                    <div key={rec.id} className="p-5 hover:bg-ink-50 flex items-center justify-between transition-colors">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold text-ink-900">
                            {rec.faultDescription || "Unnamed fault"}
                          </h3>
                          <Badge
                            className={
                              isClosed
                                ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                                : isRcaPending
                                  ? "bg-warn-500/10 text-warn-700 border-warn-500/20"
                                  : "bg-danger-500/10 text-danger-700 border-danger-500/20"
                            }
                            dot={!isClosed}
                          >
                            {isClosed ? "Resolved" : isRcaPending ? "RCA investigation" : "Open breakdown"}
                          </Badge>
                          {rec.urgency === "CRITICAL" && (
                            <Badge className="bg-danger-600 text-white border-danger-600">Production stop</Badge>
                          )}
                        </div>
                        <p className="text-xs text-ink-500">
                          <span className="">{rec.cmrfNumber}</span>
                          {" · "}
                          {formatDate(rec.reportedDate)}
                          {rec.reportedByName ? ` · ${rec.reportedByName}` : ""}
                          {rec.breakdownId ? ` · ${rec.breakdownId}` : ""}
                        </p>
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
                  message="No breakdowns reported. When a machine fails, report it here so the fault and the repair are on record."
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
