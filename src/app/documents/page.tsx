// src/app/documents/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FolderOpen, Loader2, Search, FileWarning, CheckCircle2, Clock, Download } from "lucide-react";
import { Badge } from "@/components/Badge";
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
  AVAILABLE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  REQUIRED: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  EXPIRED: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    fetch("/api/documents")
      .then((r) => r.json())
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

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

  return (
    <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
          <FolderOpen className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Document Register</h2>
          <p className="text-xs text-slate-500 font-mono">
            Schematics · manuals · SOPs · calibration · premob — per machine
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center items-center text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span className="text-xs ml-2 font-mono">Loading documents…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Stat label="Doc Compliance" value={`${summary.compliance}%`} tone="border-emerald-500/15 bg-emerald-500/5" text="text-emerald-600" icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} />
            <Stat label="On File" value={String(summary.available)} tone="border-slate-200 bg-white" text="text-slate-900" icon={<FolderOpen className="w-4 h-4 text-slate-400" />} />
            <Stat label="Missing" value={String(summary.missing)} tone="border-rose-500/15 bg-rose-500/5" text="text-rose-600" icon={<FileWarning className="w-4 h-4 text-rose-600" />} />
            <Stat label="Expired" value={String(summary.expired)} tone="border-amber-500/15 bg-amber-500/5" text="text-amber-600" icon={<Clock className="w-4 h-4 text-amber-600" />} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search machine / document…"
                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500/40 w-56"
              />
            </div>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none">
              <option value="ALL">All types</option>
              {Object.entries(DOC_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none">
              <option value="ALL">All statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="REQUIRED">Missing</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                    <th className="py-3 px-4 font-medium">Equipment</th>
                    <th className="py-3 px-4 font-medium">Document</th>
                    <th className="py-3 px-4 font-medium">Type</th>
                    <th className="py-3 px-4 font-medium">Rev</th>
                    <th className="py-3 px-4 font-medium">Expiry</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <Link href={`/equipment/${(d.assetId || "").replace(/\//g, "-")}`} className="font-medium text-slate-900 hover:text-emerald-600">
                          {d.equipmentName}
                        </Link>
                        <div className="text-[10px] font-mono text-slate-400">{d.assetId}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-xs truncate">{d.title}</td>
                      <td className="py-3 px-4 text-slate-500">{DOC_TYPE_LABELS[d.docType] ?? d.docType}</td>
                      <td className="py-3 px-4 text-slate-500">{d.revision ?? "—"}</td>
                      <td className="py-3 px-4 font-mono text-slate-500">{formatDate(d.expiryDate)}</td>
                      <td className="py-3 px-4">
                        <Badge className={STATUS_BADGE[d.status] ?? "bg-slate-100 text-slate-500 border-slate-200"}>
                          {d.status === "REQUIRED" ? "MISSING" : d.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {d.fileUrl ? (
                          <a href={d.fileUrl} className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
                            <Download className="w-3.5 h-3.5" /> Open
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Showing {filtered.length} of {docs.length} documents.</p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, text, icon }: { label: string; value: string; tone: string; text: string; icon: React.ReactNode }) {
  return (
    <div className={`p-4 rounded-xl border ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-bold mt-2 ${text}`}>{value}</div>
    </div>
  );
}
