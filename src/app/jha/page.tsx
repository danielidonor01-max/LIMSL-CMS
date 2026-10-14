// src/app/jha/page.tsx
"use client";

import Tabs from "@/components/Tabs";
import { PAGE_MAIN } from "@/lib/page-shell";
import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { useSession } from "next-auth/react";
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
import { JHA_WRITE_ROLES } from "@/lib/roles";

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
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role ?? null;
  const canCreateJha = mounted && JHA_WRITE_ROLES.includes(role ?? "");

  const { data, loading, error, refresh } = useApi<JhaRow[]>("/api/jha", []);
  const { data: wmsRaw } = useApi<any[]>("/api/wms", []);
  const wmsList = Array.isArray(wmsRaw) ? wmsRaw : [];
  const rows = Array.isArray(data) ? data : [];
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"needs_jha" | "open" | "approved" | "all">("open");

  useEffect(() => setMounted(true), []);

  const pendingWms = useMemo(() => {
    return wmsList.filter(
      (w) => w.status === "APPROVED" && (!w.hasJha || w.jhaStatus !== "APPROVED"),
    );
  }, [wmsList]);

  // If there are pending WMS needing JHA and user is HSE, default tab to needs_jha
  useEffect(() => {
    if (canCreateJha && pendingWms.length > 0 && tab === "open") {
      setTab("needs_jha");
    }
  }, [canCreateJha, pendingWms.length]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (tab === "needs_jha") {
      return pendingWms.filter((w) => {
        if (!term) return true;
        return (
          w.wmsNumber.toLowerCase().includes(term) ||
          w.title.toLowerCase().includes(term) ||
          (w.equipmentName ?? "").toLowerCase().includes(term)
        );
      });
    }
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
  }, [rows, pendingWms, q, tab]);

  const awaiting = rows.filter((r) => r.status === "UNDER_REVIEW").length;
  const approved = rows.filter((r) => r.status === "APPROVED").length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Job Hazard Analysis"
          subtitle="Where safety takes the method apart, step by step, and says what could go wrong"
          backHref="/"
          backLabel="Dashboard"
          actions={
            canCreateJha ? (
              <Button href="/jha/new" icon={PlusCircle}>
                New Analysis
              </Button>
            ) : undefined
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

        {canCreateJha && pendingWms.length > 0 && (
          <div className="bg-brand-50 border border-brand-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-brand-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-brand-900">
                  {pendingWms.length} Approved Work Method Statement{pendingWms.length === 1 ? "" : "s"} Ready for Analysis
                </p>
                <p className="text-xs text-brand-700 mt-0.5">
                  Management approval is complete. HSE may now break down the job hazards and controls to clear the way for permits.
                </p>
              </div>
            </div>
            <Button href={`/jha/new?wmsId=${pendingWms[0]?.id}`} size="sm" icon={PlusCircle}>
              Draft JHA
            </Button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Tabs
            ariaLabel="Filter hazard analyses"
            value={tab}
            onChange={setTab}
            items={[
              ...(pendingWms.length > 0
                ? [{ value: "needs_jha" as const, label: "Needs Analysis", count: pendingWms.length }]
                : []),
              { value: "open" as const, label: "Open", count: awaiting },
              { value: "approved" as const, label: "Approved", count: approved },
              { value: "all" as const, label: "All", count: rows.length },
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

        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {error ? (
            <LoadError onRetry={refresh} />
          ) : loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title={
                tab === "needs_jha"
                  ? "All approved method statements have hazard analyses"
                  : rows.length === 0
                    ? "No hazard analysis yet"
                    : "Nothing matches that"
              }
              message={
                tab === "needs_jha"
                  ? "Every approved Work Method Statement has an associated Job Hazard Analysis in place."
                  : rows.length === 0
                    ? "No hazard analysis yet. Each one is written against an approved method statement, and a permit needs one."
                    : "Try a different search or tab."
              }
              blockedBy={
                rows.length === 0
                  ? { label: "Start with a Work Method Statement", href: "/wms" }
                  : undefined
              }
            />
          ) : tab === "needs_jha" ? (
            <div className="divide-y divide-ink-200">
              {filtered.map((w: any) => (
                <div
                  key={w.id}
                  className="p-5 flex items-center justify-between gap-4 hover:bg-ink-50 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink-500">{w.wmsNumber}</span>
                      <span className="text-xs text-ink-400">rev {w.revision ?? 0}</span>
                      <Badge className="bg-brand-500/10 text-brand-700 border-brand-500/20">
                        Method Approved
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-ink-900 truncate">{w.title}</p>
                    <p className="text-xs text-ink-500">
                      Approved by {w.approvedByName ?? "Management"}
                      {w.approvedDate && ` on ${formatDate(w.approvedDate)}`}
                      {w.equipmentName && ` · ${w.equipmentName}`}
                    </p>
                  </div>
                  {canCreateJha && (
                    <Button href={`/jha/new?wmsId=${w.id}`} size="sm" icon={PlusCircle}>
                      Raise JHA
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-ink-200">
              {filtered.map((r: any) => (
                <Link
                  key={r.id}
                  href={`/jha/${r.id}`}
                  className="p-5 hover:bg-ink-50 flex items-center justify-between gap-4 transition-colors"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-ink-500">{r.jhaNumber}</span>
                      {(r.revision ?? 0) > 0 && (
                        <span className="text-xs text-ink-400">rev {r.revision}</span>
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
