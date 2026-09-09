// src/app/jha/page.tsx
"use client";

import Tabs from "@/components/Tabs";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/api-cache";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import MetricPanel from "@/components/MetricPanel";
import { Badge } from "@/components/Badge";
import { ShieldAlert, PlusCircle, Search, ChevronRight, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";

type JhaRow = {
  id: string;
  jhaNumber: string;
  title: string;
  revision: number;
  status: string;
  workArea: string | null;
  steps: string | null;
  preparedByName: string | null;
  preparedDate: string | null;
  wmsNumber: string | null;
  equipmentName: string | null;
  assetId: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  UNDER_REVIEW: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  APPROVED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  REJECTED: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  SUPERSEDED: "bg-ink-500/10 text-ink-500 border-ink-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  UNDER_REVIEW: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUPERSEDED: "Superseded",
};

const stepCount = (raw: string | null): number => {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

export default function JhaListPage() {
  const { data, loading, error, refresh } = useApi<JhaRow[]>("/api/jha", []);
  const rows = Array.isArray(data) ? data : [];
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"open" | "approved" | "all">("open");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "open" && r.status !== "UNDER_REVIEW" && r.status !== "DRAFT") return false;
      if (tab === "approved" && r.status !== "APPROVED") return false;
      if (!term) return true;
      return (
        r.jhaNumber.toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term) ||
        (r.wmsNumber ?? "").toLowerCase().includes(term) ||
        (r.equipmentName ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, q, tab]);

  const awaiting = rows.filter((r) => r.status === "UNDER_REVIEW").length;
  const approved = rows.filter((r) => r.status === "APPROVED").length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
        <PageHeader
          icon={ShieldAlert}
          title="Job Hazard Analysis"
          subtitle="Where safety takes the method apart, step by step, and says what could go wrong"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <Button href="/jha/new" icon={PlusCircle}>
              New Analysis
            </Button>
          }
        />

        <MetricPanel
          columns={3}
          label="Analysis status"
          metrics={[
            {
              key: "awaiting",
              label: "Awaiting approval",
              count: awaiting,
              value: String(awaiting),
              status: "warning",
              description: "Written and waiting on a signature",
            },
            {
              key: "approved",
              label: "Approved",
              count: approved,
              value: String(approved),
              status: "plain",
              description: "A permit may be raised against these",
            },
            {
              key: "total",
              label: "Total",
              count: rows.length,
              value: String(rows.length),
              status: "plain",
            },
          ]}
        />

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Tabs
            ariaLabel="Filter hazard analyses"
            value={tab}
            onChange={setTab}
            items={[
              { value: "open", label: "Open", count: awaiting },
              { value: "approved", label: "Approved", count: approved },
              { value: "all", label: "All", count: rows.length },
            ]}
          />
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by number, title, method statement or machine"
              className="w-full pl-9 pr-3 py-2 bg-white border border-ink-200 rounded-lg text-xs"
            />
          </div>
        </div>

        <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
          {error ? (
            <LoadError onRetry={refresh} />
          ) : loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title={rows.length === 0 ? "No hazard analysis yet" : "Nothing matches that"}
              message={
                rows.length === 0
                  ? "No hazard analysis yet. Each one is written against an approved method statement, and a permit needs one."
                  : "Try a different search or tab."
              }
              blockedBy={
                rows.length === 0
                  ? { label: "Start with a Work Method Statement", href: "/wms" }
                  : undefined
              }
            />
          ) : (
            <div className="divide-y divide-ink-200">
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  href={`/jha/${r.id}`}
                  className="p-5 hover:bg-ink-50 flex items-center justify-between gap-4 transition-colors"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-ink-500">{r.jhaNumber}</span>
                      {(r.revision ?? 0) > 0 && (
                        <span className="text-[11px] text-ink-400">rev {r.revision}</span>
                      )}
                      <Badge className={STATUS_BADGE[r.status] ?? STATUS_BADGE.DRAFT}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-ink-900 truncate">{r.title}</p>
                    <p className="text-xs text-ink-500 flex items-center gap-1.5 flex-wrap">
                      {r.wmsNumber && (
                        <span className="inline-flex items-center gap-1">
                          <FileText className="w-3 h-3" /> {r.wmsNumber}
                        </span>
                      )}
                      <span>{stepCount(r.steps)} job step(s)</span>
                      {r.equipmentName && <span>· {r.equipmentName}</span>}
                      {r.workArea && <span>· {r.workArea}</span>}
                      {r.preparedByName && <span>· {r.preparedByName}</span>}
                      {r.preparedDate && <span>· {formatDate(r.preparedDate)}</span>}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-300 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
