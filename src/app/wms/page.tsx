// src/app/wms/page.tsx
"use client";

import { useApi } from "@/lib/api-cache";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import MetricPanel from "@/components/MetricPanel";
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

  const draftCount = records.filter((r) => r.status === "DRAFT" || r.status === "UNDER_REVIEW").length;
  const approvedCount = records.filter((r) => r.status === "APPROVED").length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
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
                  const isApproved = rec.status === "APPROVED";
                  const isUnderReview = rec.status === "UNDER_REVIEW";
                  return (
                    <div key={rec.id} className="p-5 hover:bg-ink-50 flex items-center justify-between transition-colors">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-ink-500 font-semibold">{rec.wmsNumber}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
 isApproved
 ? "bg-brand-500/10 text-brand-600 border-brand-500/20"
 : isUnderReview
 ? "bg-warn-500/10 text-warn-600 border-warn-500/20"
 : "bg-ink-200 text-ink-500 border-ink-200"
 }`}
                          >
                            {rec.status}
                          </span>
                          <span className="text-xs text-ink-500">Rev {rec.revision}</span>
                        </div>
                        <h3 className="text-base font-semibold text-ink-900">{rec.title}</h3>
                        <div className="flex flex-wrap gap-4 text-xs text-ink-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-ink-500" /> Prepared:{" "}
                            <span className="">{rec.preparedDate}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-ink-500" /> Prepared By: {rec.preparedByName}
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
                  message="No method statements yet. Each one sets out how a job will be done, and must be approved before work starts."
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
