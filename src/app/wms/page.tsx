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
import KebabMenu, { type KebabItem } from "@/components/KebabMenu";
import { formatDate } from "@/lib/utils";
import {
  FileText,
  PlusCircle,
  Biohazard,
  ShieldCheck,
  ShieldAlert,
  ScrollText,
} from "lucide-react";

import { JHA_WRITE_ROLES } from "@/lib/roles";

type FilterTab = "ALL" | "READY_FOR_JHA" | "WITH_JHA" | "WITH_PTW";

export default function WmsList() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const isHse = Boolean(role && JHA_WRITE_ROLES.includes(role));

  const { data: records, loading } = useApi<any[]>("/api/wms", []);
  const [filterTab, setFilterTab] = useState<FilterTab>("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PM" | "CM">("ALL");

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

  // Newest first, then by type: the register is read as a log.
  const visible = useMemo(
    () =>
      filteredRecords
        .filter((r) => typeFilter === "ALL" || r.type === typeFilter)
        .sort((a, b) => String(b.preparedDate || b.createdAt || "").localeCompare(String(a.preparedDate || a.createdAt || ""))),
    [filteredRecords, typeFilter],
  );

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
          <SegmentedControl
            ariaLabel="Method statement type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "ALL", label: "PM and CM" },
              { value: "PM", label: "PM", count: records.filter((r) => r.type === "PM").length },
              { value: "CM", label: "CM", count: records.filter((r) => r.type === "CM").length },
            ]}
          />
        </div>

        {/* The register. One row per method statement, newest first, so the
            document number, its type and what it is linked to read across a
            line rather than out of a card. */}
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={8} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-3 px-4 font-medium">Date</th>
                    <th className="py-3 px-4 font-medium">Number</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">Title</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium">JHA</th>
                    <th className="py-3 px-4 font-medium">PTW</th>
                    <th className="py-3 px-4 font-medium w-14">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={8}>
                        <EmptyState
                          icon={ScrollText}
                          title={filterTab === "READY_FOR_JHA" ? "No WMS awaiting JHA" : "No work method statements match this filter"}
                          message={
                            filterTab === "READY_FOR_JHA"
                              ? "All approved work method statements already have an associated Job Hazard Analysis."
                              : "No method statements found for the selected filter."
                          }
                          actionLabel={filterTab === "ALL" && typeFilter === "ALL" ? "Draft a method statement" : undefined}
                          actionHref={filterTab === "ALL" && typeFilter === "ALL" ? "/wms/new" : undefined}
                        />
                      </td>
                    </tr>
                  )}
                  {visible.map((rec) => {
                    const needsJha = rec.status === "APPROVED" && !rec.hasJha;
                    const actions: KebabItem[] = [{ label: "View", icon: FileText, href: `/wms/${rec.id}` }];
                    if (needsJha && isHse) actions.push({ label: "Raise JHA", icon: Biohazard, href: `/jha/new?wmsId=${rec.id}` });
                    if (rec.hasJha) actions.push({ label: `Open ${rec.jhaNumber}`, icon: ShieldCheck, href: `/jha/${rec.jhaId}` });
                    if (rec.hasPtw) actions.push({ label: `Open ${rec.ptwNumber}`, icon: ShieldAlert, href: `/permits/${rec.ptwId}` });
                    return (
                      <tr key={rec.id} className="hover:bg-ink-50 align-top">
                        <td className="py-3 px-4 text-ink-700 tabular-nums whitespace-nowrap">
                          {formatDate(rec.preparedDate || rec.createdAt)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Link href={`/wms/${rec.id}`} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline">
                            {rec.wmsNumber}
                          </Link>
                          <div className="text-ink-500">Rev {rec.revision ?? 0}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            className={
                              rec.type === "CM"
                                ? "bg-warn-500/10 text-warn-700 border-warn-500/20"
                                : "bg-ink-500/10 text-ink-700 border-ink-500/20"
                            }
                          >
                            {rec.type === "CM" ? "CM" : "PM"}
                          </Badge>
                        </td>
                        {/* Two lines at most, in a column narrow enough to
                            leave the JHA and PTW numbers room; the whole title
                            is on hover and on the document itself. */}
                        <td className="py-3 px-4 w-[18rem] min-w-[12rem] max-w-[18rem]">
                          <div className="font-medium text-ink-900 line-clamp-2 leading-snug" title={rec.title}>
                            {rec.title}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge className={WMS_STATUS_BADGE[rec.status] ?? "bg-ink-500/10 text-ink-600 border-ink-500/20"}>
                            {WMS_STATUS_LABELS[rec.status] ?? String(rec.status).toLowerCase().replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {rec.hasJha ? (
                            <Link href={`/jha/${rec.jhaId}`} className="text-ink-900 hover:text-brand-700 hover:underline">
                              {rec.jhaNumber}
                            </Link>
                          ) : needsJha ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-warn-700">
                              <Biohazard className="w-3 h-3" /> Required
                            </span>
                          ) : (
                            <span className="text-ink-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {rec.hasPtw ? (
                            <Link href={`/permits/${rec.ptwId}`} className="text-ink-900 hover:text-brand-700 hover:underline">
                              {rec.ptwNumber}
                            </Link>
                          ) : (
                            <span className="text-ink-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <KebabMenu items={actions} ariaLabel={`Actions for ${rec.wmsNumber}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
