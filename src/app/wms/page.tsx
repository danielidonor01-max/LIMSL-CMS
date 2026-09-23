// src/app/wms/page.tsx
"use client";

import { useApi } from "@/lib/api-cache";
import { PAGE_MAIN } from "@/lib/page-shell";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import MetricPanel from "@/components/MetricPanel";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { Badge } from "@/components/Badge";
import { WMS_STATUS_BADGE, WMS_STATUS_LABELS } from "@/lib/constants";
import {
  FileText,
  User,
  PlusCircle,
  Clock,
  ChevronRight,
} from "lucide-react";

export default function WmsList() {
  const { data: records, loading } = useApi<any[]>("/api/wms", []);

  const draftCount = records.filter((r) => r.status === "DRAFT" || r.status === "UNDER_REVIEW").length;
  const approvedCount = records.filter((r) => r.status === "APPROVED").length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Work Method Statements"
          subtitle="How each job is to be carried out safely, drafted, reviewed and approved"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <Button href="/wms/new" icon={PlusCircle}>
              Draft New WMS
            </Button>
          }
        />
        <MetricPanel
          columns={3}
          label="Document status"
          metrics={[
            {
              key: "draft",
              label: "Draft or under review",
              count: draftCount,
              value: String(draftCount),
              status: "warning",
              description: "Not yet authorised to back a permit",
            },
            {
              key: "approved",
              label: "Approved and active",
              count: approvedCount,
              value: String(approvedCount),
              status: "plain",
              description: "A hazard analysis may be written against these",
            },
            {
              key: "total",
              label: "Total documents",
              count: records.length,
              value: String(records.length),
              status: "plain",
            },
          ]}
        />

        {/* WMS Documents List */}
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : (
            <div className="divide-y divide-ink-200">
              {records.length > 0 ? (
                records.map((rec) => {
                  return (
                    <div key={rec.id} className="p-5 hover:bg-ink-50 flex items-center justify-between transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-ink-500 font-semibold">{rec.wmsNumber}</span>
                          <Badge
                            className={WMS_STATUS_BADGE[rec.status] ?? "bg-ink-500/10 text-ink-600 border-ink-500/20"}
                          >
                            {WMS_STATUS_LABELS[rec.status] ?? String(rec.status).toLowerCase().replace(/_/g, " ")}
                          </Badge>
                          <span className="text-xs text-ink-500">Rev {rec.revision}</span>
                        </div>
                        <h3 className="text-base font-semibold text-ink-900">{rec.title}</h3>
                        <div className="flex flex-wrap gap-4 text-xs text-ink-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-ink-500" /> Prepared{" "}
                            <span className="tabular-nums">{rec.preparedDate}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-ink-500" /> by {rec.preparedByName}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Button variant="subtle" size="sm" href={`/wms/${rec.id}`} iconRight={ChevronRight}>
                          View
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No work method statements yet"
                  message="No method statements yet. Each one sets out how a job will be done, and must be approved before work starts."
                  actionLabel="Draft a method statement"
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
