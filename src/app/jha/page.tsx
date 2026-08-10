// src/app/jha/page.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApi } from "@/lib/api-cache";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
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
  DRAFT: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  UNDER_REVIEW: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  REJECTED: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  SUPERSEDED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <PageHeader
          icon={ShieldAlert}
          title="Job Hazard Analysis"
          subtitle="HSE's step-by-step analysis of an approved method statement. A permit cannot be raised without one."
          backHref="/"
          backLabel="Dashboard"
          actions={
            <Button href="/jha/new" icon={PlusCircle}>
              New Analysis
            </Button>
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-white border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Awaiting approval</p>
            <h2 className="text-2xl font-bold text-amber-600 mt-2">{awaiting}</h2>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Approved</p>
            <h2 className="text-2xl font-bold text-emerald-600 mt-2">{approved}</h2>
          </div>
          <div className="p-4 bg-white border border-slate-200 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total</p>
            <h2 className="text-2xl font-bold text-slate-900 mt-2">{rows.length}</h2>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            {(["open", "approved", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors ${
                  tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by number, title, method statement or machine"
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-xs"
            />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
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
                  ? "A job hazard analysis is written against an approved Work Method Statement, and a permit cannot be raised until it is approved."
                  : "Try a different search or tab."
              }
              actionLabel={rows.length === 0 ? "New Analysis" : undefined}
              actionHref={rows.length === 0 ? "/jha/new" : undefined}
            />
          ) : (
            <div className="divide-y divide-slate-200">
              {filtered.map((r) => (
                <Link
                  key={r.id}
                  href={`/jha/${r.id}`}
                  className="p-5 hover:bg-slate-50 flex items-center justify-between gap-4 transition-colors"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-slate-500">{r.jhaNumber}</span>
                      {(r.revision ?? 0) > 0 && (
                        <span className="text-[10px] text-slate-400">rev {r.revision}</span>
                      )}
                      <Badge className={STATUS_BADGE[r.status] ?? STATUS_BADGE.DRAFT}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 truncate">{r.title}</p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
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
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
