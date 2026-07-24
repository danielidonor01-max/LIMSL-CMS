// src/components/EquipmentDocuments.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { FileText, Download, FileWarning, Upload, Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/Badge";
import Select from "@/components/Select";
import { formatDate } from "@/lib/utils";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { toast } from "sonner";

type Doc = {
  id: string;
  docType: string;
  title: string;
  fileUrl: string | null;
  fileKey?: string | null;
  fileName?: string | null;
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
const DOC_TYPES = Object.keys(DOC_TYPE_LABELS);
const STATUS_BADGE: Record<string, string> = {
  AVAILABLE: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  REQUIRED: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  EXPIRED: "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

export default function EquipmentDocuments({
  assetId,
  equipmentId,
}: {
  assetId: string;
  equipmentId?: string;
}) {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const canUpload = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [eqId, setEqId] = useState(equipmentId ?? "");
  // Select renders a button (no form field), so the type is held in state
  // instead of being read back from FormData on submit.
  const [docType, setDocType] = useState("OPERATIONAL_MANUAL");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const res = await fetch(`/api/documents?assetId=${encodeURIComponent(assetId)}`);
      const d = await res.json();
      setDocs(Array.isArray(d) ? d : []);
      // Resolve the equipmentId from the first record if not supplied.
      if (!equipmentId && Array.isArray(d) && d[0]?.equipmentId) setEqId(d[0].equipmentId);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    load();
  }, [assetId]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0];
    const targetEq = eqId || equipmentId;
    if (!file) return toast.error("Choose a file to upload.");
    if (!targetEq) return toast.error("Could not resolve the equipment for this document.");

    setUploading(true);
    try {
      // 1. Upload the file to storage.
      const upForm = new FormData();
      upForm.append("file", file);
      const upRes = await fetch("/api/files", { method: "POST", body: upForm });
      if (!upRes.ok) {
        const err = await upRes.json().catch(() => ({}));
        toast.error(err.error || "Upload failed.");
        return;
      }
      const saved = await upRes.json();

      // 2. Record the document against the machine.
      const docRes = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: targetEq,
          docType,
          title: fd.get("title") || saved.name,
          revision: fd.get("revision") || null,
          expiryDate: fd.get("expiryDate") || null,
          fileKey: saved.key,
          fileName: saved.name,
          mimeType: saved.mimeType,
          fileSize: saved.size,
        }),
      });
      if (docRes.ok) {
        toast.success("Document uploaded.");
        setShowForm(false);
        if (fileRef.current) fileRef.current.value = "";
        await load();
      } else {
        const err = await docRes.json().catch(() => ({}));
        toast.error(err.error || "Failed to record document.");
      }
    } finally {
      setUploading(false);
    }
  }

  const inputCls =
    "w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs text-slate-900 focus:outline-none";

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-600" /> Documents
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-mono">{docs.length} records</span>
          {canUpload && (
            <button
              onClick={() => { setDocType("OPERATIONAL_MANUAL"); setShowForm((s) => !s); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold"
            >
              <Plus className="w-3.5 h-3.5" /> Upload
            </button>
          )}
        </div>
      </div>

      {showForm && canUpload && (
        <form onSubmit={handleUpload} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Document Type</label>
              <Select value={docType} onChange={setDocType} className="w-full">
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Revision (optional)</label>
              <input name="revision" className={inputCls} placeholder="e.g. Rev B" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Title (optional)</label>
              <input name="title" className={inputCls} placeholder="defaults to filename" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase">Expiry (optional)</label>
              <input name="expiryDate" type="date" className={inputCls} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 uppercase">File</label>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
              className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-200 file:text-slate-700 file:text-xs file:font-semibold"
            />
            <p className="text-[10px] text-slate-400">PDF, images, Office docs, CSV or text — up to 25 MB.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">
              Cancel
            </button>
            <button type="submit" disabled={uploading} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold disabled:opacity-60">
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
            </button>
          </div>
        </form>
      )}

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
                    {d.fileName ? `${d.fileName}` : d.expiryDate ? `expires ${formatDate(d.expiryDate)}` : d.title}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge className={STATUS_BADGE[d.status] ?? "bg-slate-100 text-slate-500 border-slate-200"}>
                  {d.status === "REQUIRED" ? "MISSING" : d.status}
                </Badge>
                {d.fileUrl && (
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-600 hover:text-emerald-700"
                    title="Open document"
                  >
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
