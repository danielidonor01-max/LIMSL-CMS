// src/app/settings/import/page.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Database, Download, Upload, Loader2, ShieldAlert, CheckCircle2, AlertTriangle, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import Button from "@/components/Button";
import { ROLE_LABELS, SETTINGS_WRITE_ROLES } from "@/lib/roles";

type EntityKey = "equipment" | "schedule" | "users";
type ImportAction = "create" | "update" | "error";
type PreviewRow = { row: number; label: string; action: ImportAction; errors: string[] };
type Summary = { total: number; create: number; update: number; error: number; created: number; updated: number };
type Credential = { email: string; tempPassword: string };
type Result = { preview: PreviewRow[]; summary: Summary; credentials?: Credential[] };

const TABS: { key: EntityKey; label: string; blurb: string }[] = [
  { key: "equipment", label: "Equipment Register", blurb: "The 33-machine asset register. Matched by Asset ID — re-importing updates, never duplicates." },
  { key: "schedule", label: "Maintenance Schedule", blurb: "Planned PM/inspection activities, linked to equipment by Asset ID." },
  { key: "users", label: "User Roster", blurb: "People & roles. New users get a temporary password shown once, here." },
];

const ACTION_BADGE: Record<ImportAction, string> = {
  create: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  update: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  error: "bg-rose-500/10 text-rose-700 border-rose-500/20",
};

export default function DataImportPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const canWrite = !!role && SETTINGS_WRITE_ROLES.includes(role);

  const [tab, setTab] = useState<EntityKey>("equipment");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [committed, setCommitted] = useState<Result | null>(null);
  const [busy, setBusy] = useState<null | "preview" | "commit">(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const switchTab = (t: EntityKey) => {
    setTab(t);
    reset();
  };

  const send = async (mode: "preview" | "commit") => {
    if (!file) {
      toast.error("Choose a CSV or Excel file first.");
      return;
    }
    setBusy(mode);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", mode);
      const res = await fetch(`/api/import/${tab}`, { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Import failed.");
        return;
      }
      if (mode === "preview") {
        setPreview(d);
        setCommitted(null);
      } else {
        setCommitted(d);
        setPreview(null);
        toast.success(`Imported: ${d.summary.created} created, ${d.summary.updated} updated.`);
      }
    } catch {
      toast.error("Import failed.");
    } finally {
      setBusy(null);
    }
  };

  const importable = useMemo(() => (preview ? preview.summary.create + preview.summary.update : 0), [preview]);

  if (status === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (!canWrite) {
    return (
      <div className="p-10 max-w-md mx-auto text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Access restricted</h2>
        <p className="text-sm text-slate-500">
          Data import is available to Super Admins only. Your role is{" "}
          <span className="font-semibold">{ROLE_LABELS[role ?? "VIEWER"] ?? role}</span>.
        </p>
      </div>
    );
  }

  const active = TABS.find((t) => t.key === tab)!;

  return (
    <div className="p-6 max-w-4xl w-full mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
          <Database className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Data Import</h2>
          <p className="text-xs text-slate-500 font-mono">Super Admin · go-live register import (CSV / Excel)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              tab === t.key ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Uploader */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <p className="text-xs text-slate-500">{active.blurb}</p>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/api/import/${tab}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
          >
            <Download className="w-4 h-4" /> Download template
          </a>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setCommitted(null);
            }}
            className="text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-slate-200 file:bg-slate-50 file:text-slate-700 file:text-xs file:font-semibold hover:file:bg-slate-100"
          />
          <Button variant="secondary" icon={Upload} loading={busy === "preview"} onClick={() => send("preview")} disabled={!file}>
            Preview
          </Button>
        </div>

        {/* Preview */}
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <SummaryChip tone="emerald" label={`${preview.summary.create} to create`} />
              <SummaryChip tone="sky" label={`${preview.summary.update} to update`} />
              <SummaryChip tone="rose" label={`${preview.summary.error} with errors`} />
              <span className="text-slate-400">· {preview.summary.total} rows</span>
            </div>

            <div className="max-h-80 overflow-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50">
                  <tr className="text-slate-500 border-b border-slate-200">
                    <th className="py-2 px-3 font-medium">Row</th>
                    <th className="py-2 px-3 font-medium">Record</th>
                    <th className="py-2 px-3 font-medium">Action</th>
                    <th className="py-2 px-3 font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.preview.map((p) => (
                    <tr key={p.row} className={p.action === "error" ? "bg-rose-500/5" : ""}>
                      <td className="py-2 px-3 font-mono text-slate-400">{p.row}</td>
                      <td className="py-2 px-3 text-slate-800">{p.label}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase ${ACTION_BADGE[p.action]}`}>
                          {p.action}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-rose-600">{p.errors.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.summary.error > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-700">
                <AlertTriangle className="w-4 h-4" /> Rows with errors are skipped. Fix them in your file and re-preview to include them.
              </p>
            )}

            <Button icon={Database} loading={busy === "commit"} onClick={() => send("commit")} disabled={importable === 0}>
              Import {importable} row{importable === 1 ? "" : "s"}
            </Button>
          </div>
        )}

        {/* Commit result */}
        {committed && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>
                Imported <strong>{committed.summary.created}</strong> new and updated <strong>{committed.summary.updated}</strong>
                {committed.summary.error > 0 ? `, skipped ${committed.summary.error} with errors` : ""}.
              </span>
            </div>

            {committed.credentials && committed.credentials.length > 0 && (
              <div className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-4 space-y-2">
                <p className="text-xs font-semibold text-amber-800">
                  Temporary passwords for {committed.credentials.length} new user(s) — shown once. Share securely; each user must change it on first login.
                </p>
                <div className="space-y-1">
                  {committed.credentials.map((c) => (
                    <div key={c.email} className="flex items-center justify-between gap-2 text-xs font-mono bg-white border border-slate-200 rounded px-2.5 py-1.5">
                      <span className="text-slate-700">{c.email}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-900 font-semibold">{c.tempPassword}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${c.email} — ${c.tempPassword}`);
                            setCopied(c.email);
                            setTimeout(() => setCopied(null), 1500);
                          }}
                          className="text-slate-400 hover:text-emerald-600"
                        >
                          {copied === c.email ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button variant="secondary" onClick={reset}>Import another file</Button>
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryChip({ tone, label }: { tone: "emerald" | "sky" | "rose"; label: string }) {
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
      : tone === "sky"
        ? "bg-sky-500/10 text-sky-700 border-sky-500/20"
        : "bg-rose-500/10 text-rose-700 border-rose-500/20";
  return <span className={`inline-block px-2.5 py-1 rounded-full border font-semibold ${cls}`}>{label}</span>;
}
