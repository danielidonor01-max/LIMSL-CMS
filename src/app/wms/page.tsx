// src/app/wms/page.tsx
"use client";

import { useApi } from "@/lib/api-cache";
import { PAGE_MAIN } from "@/lib/page-shell";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import MetricPanel from "@/components/MetricPanel";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import SegmentedControl from "@/components/SegmentedControl";
import { Badge } from "@/components/Badge";
import { WMS_STATUS_BADGE, WMS_STATUS_LABELS } from "@/lib/constants";
import {
  FileText,
  User,
  PlusCircle,
  Clock,
  ChevronRight,
  Biohazard,
  ShieldCheck,
  ShieldAlert,
  Layers,
} from "lucide-react";

import { JHA_WRITE_ROLES } from "@/lib/roles";

type FilterTab = "ALL" | "READY_FOR_JHA" | "WITH_JHA" | "WITH_PTW";

export default function WmsList() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isHse = Boolean(role && JHA_WRITE_ROLES.includes(role));

  const { data: records, loading } = useApi<any[]>("/api/wms", []);
  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");

  const draftCount = records.filter((r) => r.status === "DRAFT" || r.status === "UNDER_REVIEW").length;
  const approvedCount = records.filter((r) => r.status === "APPROVED").length;
  const readyForJhaCount = records.filter((r) => r.status === "APPROVED" && !r.hasJha).length;
  const withJhaCount = records.filter((r) => r.hasJha).length;
  const withPtwCount = records.filter((r) => r.hasPtw).length;

  const filteredRecords = useMemo(() => {
    switch (filterTab) {
      case "READY_FOR_JHA":
        return records.filter((r) => r.status === "APPROVED" && !r.hasJha);
      case "WITH_JHA":
        return records.filter((r) => r.hasJha);
      case "WITH_PTW":
        return records.filter((r) => r.hasPtw);
      default:
        return records;
    }
  }, [records, filterTab]);

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Work Method Statements"
          subtitle="Technical procedure statements with safety linkage to JHA and Permit to Work (PTW)"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <div className="flex items-center gap-2">
              {isHse && readyForJhaCount > 0 && (
                <Button variant="secondary" href={`/jha/new`} icon={Biohazard}>
                  New JHA
                </Button>
              )}
              <Button href="/wms/new" icon={PlusCircle}>
                Draft New WMS
              </Button>
            </div>
          }
        />
        <MetricPanel
          columns={4}
          label="Document & Safety Status"
          metrics={[
            {
              key: "approved",
              label: "Approved WMS",
              count: approvedCount,
              value: String(approvedCount),
              status: "plain",
              description: "Method statements in force",
            },
            {
              key: "readyForJha",
              label: "Ready for JHA (HSE)",
              count: readyForJhaCount,
              value: String(readyForJhaCount),
              status: readyForJhaCount > 0 ? "warning" : "plain",
              icon: Biohazard,
              description: "Approved WMS awaiting JHA creation",
            },
            {
              key: "withJha",
              label: "With JHA Linked",
              count: withJhaCount,
              value: String(withJhaCount),
              status: "plain",
              icon: ShieldCheck,
              description: "Hazard analysis completed",
            },
            {
              key: "withPtw",
              label: "With Active PTW",
              count: withPtwCount,
              value: String(withPtwCount),
              status: "plain",
              icon: ShieldAlert,
              description: "Permits issued against method",
            },
          ]}
        />

        {/* Filter controls */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SegmentedControl
            ariaLabel="WMS Safety Linkage filter"
            value={filterTab}
            onChange={setFilterTab}
            options={[
              { value: "ALL", label: "All WMS", count: records.length },
              { value: "READY_FOR_JHA", label: "Ready for JHA (HSE Action)", count: readyForJhaCount },
              { value: "WITH_JHA", label: "With JHA", count: withJhaCount },
              { value: "WITH_PTW", label: "With PTW", count: withPtwCount },
            ]}
          />
        </div>

        {/* WMS Documents List */}
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : (
            <div className="divide-y divide-ink-200">
              {filteredRecords.length > 0 ? (
                filteredRecords.map((rec) => {
                  const needsJha = rec.status === "APPROVED" && !rec.hasJha;
                  return (
                    <div key={rec.id} className="p-5 hover:bg-ink-50 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors">
                      <div className="space-y-2 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-ink-500 font-semibold">{rec.wmsNumber}</span>
                          <Badge
                            className={WMS_STATUS_BADGE[rec.status] ?? "bg-ink-500/10 text-ink-600 border-ink-500/20"}
                          >
                            {WMS_STATUS_LABELS[rec.status] ?? String(rec.status).toLowerCase().replace(/_/g, " ")}
                          </Badge>
                          <span className="text-xs text-ink-500">Rev {rec.revision}</span>

                          {/* Safety linkage badges */}
                          {rec.hasJha ? (
                            <Link href={`/jha/${rec.jhaId}`} className="hover:opacity-80">
                              <Badge className="bg-brand-500/10 text-brand-700 border-brand-500/20">
                                JHA: {rec.jhaNumber} ({rec.jhaStatus})
                              </Badge>
                            </Link>
                          ) : rec.status === "APPROVED" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-warn-500/10 text-warn-700 border-warn-500/20">
                              <Biohazard className="w-3 h-3 text-warn-600" /> JHA Required
                            </span>
                          ) : (
                            <span className="text-xs text-ink-400">No JHA</span>
                          )}

                          {rec.hasPtw ? (
                            <Link href={`/permits/${rec.ptwId}`} className="hover:opacity-80">
                              <Badge className="bg-info-500/10 text-info-700 border-info-500/20">
                                PTW: {rec.ptwNumber} ({rec.ptwStatus})
                              </Badge>
                            </Link>
                          ) : (
                            <span className="text-xs text-ink-400">No PTW</span>
                          )}
                        </div>

                        <h3 className="text-base font-semibold text-ink-900">{rec.title}</h3>

                        {rec.equipmentName && (
                          <p className="text-xs text-ink-600 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                            <span className="font-medium text-ink-800">Machinery Scope:</span> {rec.equipmentName}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-4 text-xs text-ink-500">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-ink-500" /> Prepared{" "}
                            <span className="tabular-nums">{rec.preparedDate}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5 text-ink-500" /> by {rec.preparedByName}
                          </div>
                          {rec.approvedByName && (
                            <div className="flex items-center gap-1 text-ink-700">
                              Approved by {rec.approvedByName} ({rec.approvedDate})
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-start md:self-auto">
                        {needsJha && (
                          <Button size="sm" href={`/jha/new?wmsId=${rec.id}`} icon={Biohazard}>
                            Raise JHA
                          </Button>
                        )}
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
                  title={filterTab === "READY_FOR_JHA" ? "No WMS awaiting JHA" : "No work method statements match this filter"}
                  message={
                    filterTab === "READY_FOR_JHA"
                      ? "All approved work method statements already have an associated Job Hazard Analysis."
                      : "No method statements found for the selected category."
                  }
                  actionLabel={filterTab === "ALL" ? "Draft a method statement" : undefined}
                  actionHref={filterTab === "ALL" ? "/wms/new" : undefined}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
