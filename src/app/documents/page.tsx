// src/app/documents/page.tsx
"use client";

import MetricPanel from "@/components/MetricPanel";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useApi } from "@/lib/api-cache";
import { FolderOpen, Search, FileWarning, CheckCircle2, Clock, Download, ChevronRight, FileText } from "lucide-react";
import { Badge } from "@/components/Badge";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { formatDate } from "@/lib/utils";

type Doc = {
  id: string;
  equipmentId: string;
  docType: string;
  title: string;
  fileUrl: string | null;
  status: string;
  issuedDate: string | null;
  expiryDate: string | null;
  revision: string | null;
  equipmentName: string | null;
  assetId: string | null;
  category: string | null;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  ELECTRICAL_SCHEMATIC: "Electrical Schematic",
  OPERATIONAL_MANUAL: "Operational Manual",
  SOP: "SOP",
  CALIBRATION_REPORT: "Calibration Report",
  PREMOB_REPORT: "Premob / Load Test",
  DATASHEET: "Datasheet",
  WARRANTY: "Warranty",
  OTHER: "Other",
};

const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: "bg-brand-500/10 text-brand-600 border-brand-500/20",
  REQUIRED: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  EXPIRED: "bg-warn-500/10 text-warn-600 border-warn-500/20",
};

export default function DocumentsPage() {
  const { data: docsData, loading } = useApi<Doc[]>("/api/documents", []);
  const docs = Array.isArray(docsData) ? docsData : [];
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const summary = useMemo(() => {
    const available = docs.filter((d) => d.status === "AVAILABLE").length;
    const missing = docs.filter((d) => d.status === "REQUIRED").length;
    const expired = docs.filter((d) => d.status === "EXPIRED").length;
    const compliance = docs.length ? Math.round((available / docs.length) * 100) : 0;
    return { available, missing, expired, compliance, total: docs.length };
  }, [docs]);

  const filtered = useMemo(() => {
    let out = docs;
    if (typeFilter !== "ALL") out = out.filter((d) => d.docType === typeFilter);
    if (statusFilter !== "ALL") out = out.filter((d) => d.status === statusFilter);
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter(
        (d) =>
          d.equipmentName?.toLowerCase().includes(t) ||
          d.assetId?.toLowerCase().includes(t) ||
          d.title.toLowerCase().includes(t),
      );
    }
    return [...out].sort((a, b) => (a.equipmentName ?? "").localeCompare(b.equipmentName ?? ""));
  }, [docs, q, typeFilter, statusFilter]);

  // Group the filtered documents by equipment (name shown once, expandable).
  const groups = useMemo(() => {
    const byEq = new Map<string, { name: string; assetId: string | null; docs: Doc[] }>();
    for (const d of filtered) {
      const key = d.equipmentId;
      if (!byEq.has(key)) byEq.set(key, { name: d.equipmentName ?? "Unassigned", assetId: d.assetId, docs: [] });
      byEq.get(key)!.docs.push(d);
    }
    return [...byEq.entries()]
      .map(([id, g]) => ({ id, ...g }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const filtersActive = q.trim() !== "" || typeFilter !== "ALL" || statusFilter !== "ALL";
  const clearFilters = () => {
    setQ("");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
  };

  return (
    <div className="p-6 max-w-7xl w-full mx-auto space-y-8">
      <PageHeader
        title="Document Register"
        subtitle="Schematics, manuals, SOPs, calibration and load-test reports held against each machine"
      />

      {loading ? (
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          <TableSkeleton rows={6} cols={4} />
        </div>
      ) : (
        <>
          <MetricPanel
            label="Document compliance"
            metrics={[
              {
                key: "compliance",
                label: "Doc compliance",
                // A percentage is a scale, not a count, so no zero rule: 0%
                // compliance genuinely is the alarming case.
                value: `${summary.compliance}%`,
                status: summary.compliance >= 90 ? "plain" : "danger",
                icon: CheckCircle2,
                description: "Machines with every required document on file",
              },
              {
                key: "available",
                label: "On file",
                count: summary.available,
                value: String(summary.available),
                status: "plain",
                icon: FolderOpen,
              },
              {
                key: "missing",
                label: "Missing",
                count: summary.missing,
                value: String(summary.missing),
                status: "danger",
                icon: FileWarning,
                description: "Never supplied or never uploaded",
              },
              {
                key: "expired",
                label: "Expired",
                count: summary.expired,
                value: String(summary.expired),
                status: "warning",
                icon: Clock,
                description: "On file but out of date",
              },
            ]}
          />

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search machine / document…"
                className="pl-8 pr-3 py-1.5 bg-white border border-ink-200 rounded-lg text-xs text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500/40 w-56"
              />
            </div>
            <Select value={typeFilter} onChange={(v) => setTypeFilter(v)}>
              <option value="ALL">All types</option>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Select value={statusFilter} onChange={(v) => setStatusFilter(v)}>
              <option value="ALL">All statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="REQUIRED">Missing</option>
              <option value="EXPIRED">Expired</option>
            </Select>
          </div>

          {/* Accordion: one row per machine, expand to reveal its documents */}
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden divide-y divide-ink-200">
            {groups.length === 0 ? (
              filtersActive ? (
                <EmptyState
                  icon={Search}
                  title="No documents match these filters"
                  message="Nothing in the register matches the current search, type and status."
                  actionLabel="Clear filters"
                  onAction={clearFilters}
                />
              ) : (
                <EmptyState
                  icon={FolderOpen}
                  title="No documents on file"
                  message="Schematics, manuals, SOPs and certificates are attached to a machine from its equipment record."
                  actionLabel="Go to Equipment Registry"
                  actionHref="/equipment"
                />
              )
            ) : (
              groups.map((g) => {
                const isOpen = expanded.has(g.id);
                const missing = g.docs.filter((d) => d.status === "REQUIRED").length;
                const expiredN = g.docs.filter((d) => d.status === "EXPIRED").length;
                return (
                  <div key={g.id}>
                    {/* Equipment row (accordion header) */}
                    <button
                      onClick={() => toggle(g.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink-50 text-left transition-colors"
                    >
                      <ChevronRight className={`w-4 h-4 text-ink-400 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-900 truncate">{g.name}</p>
                        <p className="text-xs text-ink-400">
                          {g.assetId ? (
                            <Link
                              href={`/equipment/${g.assetId.replace(/\//g, "-")}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-brand-600 hover:underline"
                            >
                              {g.assetId}
                            </Link>
                          ) : (
                            ", "
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {missing > 0 && (
                          <span className="text-xs font-semibold text-danger-600 bg-danger-500/10 border border-danger-500/20 rounded-full px-2 py-0.5">
                            {missing} missing
                          </span>
                        )}
                        {expiredN > 0 && (
                          <span className="text-xs font-semibold text-warn-600 bg-warn-500/10 border border-warn-500/20 rounded-full px-2 py-0.5">
                            {expiredN} expired
                          </span>
                        )}
                        <span className="text-xs text-ink-500">{g.docs.length} doc{g.docs.length === 1 ? "" : "s"}</span>
                      </div>
                    </button>

                    {/* Documents for this machine */}
                    {isOpen && (
                      <div className="bg-ink-50/60 px-4 pb-3">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-ink-400">
                              <th className="py-2 pl-7 font-medium">Document</th>
                              <th className="py-2 px-3 font-medium">Type</th>
                              <th className="py-2 px-3 font-medium">Rev</th>
                              <th className="py-2 px-3 font-medium">Expiry</th>
                              <th className="py-2 px-3 font-medium">Status</th>
                              <th className="py-2 px-3 font-medium text-right">File</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-ink-200">
                            {g.docs.map((d) => (
                              <tr key={d.id} className="hover:bg-white">
                                <td className="py-2 pl-7 text-ink-800 max-w-xs truncate flex items-center gap-2">
                                  <FileText className="w-3.5 h-3.5 text-ink-400 shrink-0" /> {d.title}
                                </td>
                                <td className="py-2 px-3 text-ink-500">{DOC_TYPE_LABELS[d.docType] ?? d.docType}</td>
                                <td className="py-2 px-3 text-ink-500">{d.revision ?? "-"}</td>
                                <td className="py-2 px-3 tabular-nums text-ink-500">{formatDate(d.expiryDate)}</td>
                                <td className="py-2 px-3">
                                  <Badge className={STATUS_BADGE[d.status] ?? "bg-ink-100 text-ink-500 border-ink-200"}>
                                    {d.status === "REQUIRED" ? "MISSING" : d.status}
                                  </Badge>
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {d.fileUrl && !d.fileUrl.startsWith("#") ? (
                                    <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                                      <Download className="w-3.5 h-3.5" /> Open
                                    </a>
                                  ) : (
                                    <span className="text-ink-400">, </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <p className="text-xs text-ink-400">{groups.length} machine{groups.length === 1 ? "" : "s"} · {filtered.length} of {docs.length} documents.</p>
        </>
      )}
    </div>
  );
}
