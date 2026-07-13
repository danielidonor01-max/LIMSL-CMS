// src/components/EquipmentDocuments.tsx
"use client";

import { useEffect, useState } from "react";
import { FileText, Download, FileWarning } from "lucide-react";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";

type Doc = {
  id: string;
  docType: string;
  title: string;
  fileUrl: string | null;
  status: string;
  expiryDate: string | null;
  revision: string | null;
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

export default function EquipmentDocuments({ assetId }: { assetId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/documents?assetId=${encodeURIComponent(assetId)}`)
      .then((r) => r.json())
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [assetId]);

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-600" /> Documents
        </h2>
        <span className="text-[10px] text-slate-400 font-mono">{docs.length} records</span>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 py-4">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-slate-400 py-4">No documents registered for this machine.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50">
              <div className="flex items-center gap-2.5 min-w-0">
                {d.status === "REQUIRED" ? (
                  <FileWarning className="w-4 h-4 text-rose-500 shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{DOC_TYPE_LABELS[d.docType] ?? d.docType}</p>
                  <p className="text-[10px] text-slate-400 truncate">
                    {d.revision ? `${d.revision} · ` : ""}
                    {d.expiryDate ? `expires ${formatDate(d.expiryDate)}` : d.title}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={STATUS_BADGE[d.status] ?? "bg-slate-100 text-slate-500 border-slate-200"}>
                  {d.status === "REQUIRED" ? "MISSING" : d.status}
                </Badge>
                {d.fileUrl && (
                  <a href={d.fileUrl} className="text-emerald-600 hover:text-emerald-700" title="Open document">
                    <Download className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
