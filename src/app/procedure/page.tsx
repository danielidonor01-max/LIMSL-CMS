// src/app/procedure/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/api-cache";
import { toast } from "sonner";
import {
  BookText,
  Loader2,
  Printer,
  History,
  FilePlus2,
  ShieldCheck,
  Clock,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import SignoffChain from "@/components/SignoffChain";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import { FIELD_CLASS } from "@/components/Field";
import { formatDate } from "@/lib/utils";
import { DOC_STATUS_LABELS } from "@/lib/constants";

type Rev = {
  id: string;
  code: string;
  title: string;
  revision: number;
  status: string;
  changeSummary: string | null;
  preparedByName: string | null;
  effectiveDate: string | null;
  createdAt?: string | null;
  contentMarkdown?: string;
};

const STATUS_BADGE: Record<string, string> = {
  APPROVED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  SUPERSEDED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  DRAFT: "bg-sky-500/10 text-sky-700 border-sky-500/20",
  REJECTED: "bg-rose-500/10 text-rose-700 border-rose-500/20",
};

export default function ProcedurePage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const canPropose = role === "QA_QC" || role === "SUPER_ADMIN";

  const { data: procData, loading, refresh } = useApi<{
    current?: Rev | null;
    pending?: { id: string; revision: number } | null;
    revisions?: Rev[];
  }>("/api/procedure", {});
  const current = procData.current ?? null;
  const pending = procData.pending ?? null;
  const revisions = procData.revisions ?? [];
  const [showHistory, setShowHistory] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    refresh();
  };

  const startEdit = () => {
    setDraft(current?.contentMarkdown ?? "");
    setSummary("");
    setEditing(true);
  };

  const propose = async () => {
    setSaving(true);
    const res = await fetch("/api/procedure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentMarkdown: draft, changeSummary: summary, title: current?.title }),
    });
    setSaving(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(d.error || "Failed to propose revision.");
      return;
    }
    toast.success(`Revision ${d.revision} proposed — awaiting sign-off (Maint. Manager, Factory Manager, COO).`);
    setEditing(false);
    load();
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl w-full mx-auto space-y-6">
      {/* Header (hidden on print) */}
      <div className="no-print">
        <PageHeader
          icon={BookText}
          title="Equipment Maintenance Procedure"
          subtitle="The controlled, signed-off method for maintaining equipment"
          code={current ? `${current.code} · Rev ${current.revision}` : undefined}
          actions={
            <>
              <Button variant="secondary" icon={History} onClick={() => setShowHistory((s) => !s)}>
                History
              </Button>
              <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
              {canPropose && !pending && (
                <Button icon={FilePlus2} onClick={startEdit}>
                  Propose Revision
                </Button>
              )}
            </>
          }
        />
      </div>

      {/* Revision history */}
      {showHistory && (
        <div className="no-print bg-white border border-slate-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Revision history</h3>
          <div className="space-y-1.5">
            {revisions.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-slate-900">Rev {r.revision}</span>
                  <Badge className={STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-500 border-slate-200"}>{DOC_STATUS_LABELS[r.status] ?? r.status}</Badge>
                  <span className="text-slate-500">{r.changeSummary}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-mono">{formatDate(r.effectiveDate ?? r.createdAt)}</span>
                  <Link href={`/procedure/${r.id}`} className="text-emerald-600 hover:underline">View</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending revision approval */}
      {pending && (
        <div className="no-print space-y-4">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
            <Clock className="w-4 h-4" />
            Revision {pending.revision} is pending sign-off. It becomes effective once QA/QC, Maintenance Manager, Factory Manager and COO have signed.
          </div>
          <SignoffChain entityType="PROCEDURE" entityId={pending.id} title="Procedure Revision Sign-off" />
        </div>
      )}

      {/* Propose editor */}
      {editing && (
        <div className="no-print bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" /> Propose new revision (QA/QC document control)
          </h3>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Summary of amendment…"
            className={FIELD_CLASS}
          />
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={18}
            className={`${FIELD_CLASS} text-xs font-mono`}
          />
          <p className="text-[10px] text-slate-400">Markdown: # heading, ## section, - bullet, **bold**. Content is retained verbatim.</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            <Button icon={FilePlus2} onClick={propose} disabled={saving} loading={saving}>
              Submit for approval
            </Button>
          </div>
        </div>
      )}

      {/* The controlled document (printable) */}
      <div className="bg-white border border-slate-200 rounded-xl p-8 print:border-0 print:p-0" id="procedure-doc">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
          <div>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Controlled Document</p>
            <p className="text-xs font-semibold text-slate-900">{current?.code}</p>
          </div>
          <div className="text-right">
            <Badge className={STATUS_BADGE[current?.status ?? "APPROVED"]}>{DOC_STATUS_LABELS[current?.status ?? "APPROVED"] ?? current?.status}</Badge>
            <p className="text-[10px] text-slate-400 mt-1 font-mono">
              Rev {current?.revision} · effective {formatDate(current?.effectiveDate)}
            </p>
          </div>
        </div>
        {current?.contentMarkdown ? (
          <Markdown content={current.contentMarkdown} />
        ) : (
          <p className="text-sm text-slate-400">No approved procedure on record.</p>
        )}
      </div>
    </div>
  );
}
