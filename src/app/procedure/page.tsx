// src/app/procedure/page.tsx
"use client";

import { useEffect, useState } from "react";
import { PAGE_MAIN } from "@/lib/page-shell";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/api-cache";
import { toast } from "sonner";
import {
  Loader2,
  Printer,
  History,
  FilePlus2,
  ShieldCheck,
  Clock,
} from "lucide-react";
import Markdown from "@/components/Markdown";
import SignoffChain from "@/components/SignoffChain";
import DocumentSeal from "@/components/DocumentSeal";
import WmsDocumentHeader, { type RevisionEntry } from "@/components/WmsDocumentHeader";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import { PROCEDURE_CONTROL_ROLES } from "@/lib/roles";
import PageHeader from "@/components/PageHeader";
import { FIELD_CLASS } from "@/components/Field";
import { formatDate } from "@/lib/utils";
import { DOC_STATUS_LABELS } from "@/lib/constants";

import Modal from "@/components/Modal";

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
  APPROVED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  PENDING_APPROVAL: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  SUPERSEDED: "bg-ink-500/10 text-ink-500 border-ink-500/20",
  DRAFT: "bg-info-500/10 text-info-700 border-info-500/20",
  REJECTED: "bg-danger-500/10 text-danger-700 border-danger-500/20",
};

export default function ProcedurePage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = (session?.user as { role?: string })?.role;
  // Deferred past mount like every other role-dependent render in the app.
  // The session resolves client-side only.
  const canPropose = mounted && PROCEDURE_CONTROL_ROLES.includes(role ?? "");

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
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
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
    if (!summary.trim()) {
      toast.error("Please enter a summary of the amendment.");
      return;
    }
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
    toast.success(`Revision ${d.revision} proposed. Awaiting Maintenance Manager, Factory Manager and COO.`);
    setEditing(false);
    setConfirmCloseOpen(false);
    load();
  };

  const handleRequestClose = () => {
    setConfirmCloseOpen(true);
  };

  const handleConfirmDiscard = () => {
    setConfirmCloseOpen(false);
    setEditing(false);
    setDraft(current?.contentMarkdown ?? "");
    setSummary("");
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-ink-500">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className={PAGE_MAIN.detail}>
      {/* Header (hidden on print) */}
      <div className="no-print">
        <PageHeader
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
        <div className="no-print bg-surface border border-line rounded-xl shadow-card p-4">
          <h3 className="text-sm font-semibold text-ink-900 mb-3">Revision history</h3>
          <div className="space-y-1.5">
            {revisions.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-xs py-1.5 border-b border-ink-100 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink-900">Rev {r.revision}</span>
                  <Badge className={STATUS_BADGE[r.status] ?? "bg-ink-100 text-ink-500 border-ink-200"}>{DOC_STATUS_LABELS[r.status] ?? r.status}</Badge>
                  <span className="text-ink-500">{r.changeSummary}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-ink-400 tabular-nums">{formatDate(r.effectiveDate ?? r.createdAt)}</span>
                  <Link href={`/procedure/${r.id}`} className="text-brand-600 hover:underline">View</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending revision approval */}
      {pending && (
        <div className="no-print space-y-4">
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-warn-200 bg-warn-50 text-warn-800 text-sm">
            <Clock className="w-4 h-4" />
            Revision {pending.revision} is pending sign-off. It becomes effective once QA/QC, Maintenance Manager, Factory Manager and COO have signed.
          </div>
          <SignoffChain entityType="PROCEDURE" entityId={pending.id} title="Procedure revision sign-off" />
        </div>
      )}

      {/* Propose revision modal */}
      <Modal
        open={editing}
        onClose={handleRequestClose}
        title="Propose Maintenance Procedure Revision"
        subtitle="QA/QC controlled document revision. Submitting initiates authorization sign-off workflow."
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-700 block mb-1">
              Summary of Amendment <span className="text-danger-600">*</span>
            </label>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="e.g. Revised safety isolation and mechanical check intervals"
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-ink-700">
                Procedure Markdown Content
              </label>
              <span className="text-xs text-ink-400"># Heading, ## Section, - Bullet, **Bold**</span>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              className={`${FIELD_CLASS} text-xs font-sans leading-relaxed`}
              placeholder="# Maintenance Procedure Content..."
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-ink-100">
            <Button variant="secondary" onClick={handleRequestClose}>
              Cancel
            </Button>
            <Button
              icon={FilePlus2}
              onClick={propose}
              disabled={saving || !summary.trim()}
              loading={saving}
            >
              Submit for approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirmation prompt before closing revision modal */}
      <Modal
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        title="Confirm Exit"
        subtitle="You are about to close the revision proposal editor."
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-600 leading-relaxed">
            Do you want to save and submit your changes before closing, or discard and exit?
          </p>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2 pt-2 border-t border-ink-100">
            <Button
              variant="secondary"
              onClick={() => setConfirmCloseOpen(false)}
            >
              Keep Editing
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmDiscard}
            >
              Discard & Close
            </Button>
            {summary.trim() && (
              <Button
                icon={FilePlus2}
                onClick={propose}
                loading={saving}
              >
                Save & Submit
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* The controlled document (printable) */}
      <div className="bg-surface border border-line rounded-xl shadow-card p-6 md:p-8 print:border-0 print:p-0 space-y-6" id="procedure-doc">
        <WmsDocumentHeader
          docNumber={current?.code ?? "LIMSL-MAIN-PROC-001"}
          title={current?.title ?? "Equipment and System Maintenance Procedure"}
          revNo={current?.revision ?? 1}
          dateRevised={formatDate(current?.effectiveDate ?? current?.createdAt)}
          procedureLabel="EQUIPMENT MAINTENANCE PROCEDURE"
          revisions={
            (revisions && revisions.length > 0)
              ? revisions.map((r) => ({
                  rev: r.revision,
                  date: formatDate(r.effectiveDate ?? r.createdAt),
                  description: r.changeSummary || "ISSUED FOR IMPLEMENTATION AND CONTROL",
                  preparedBy: {
                    name: r.preparedByName || "Originator",
                    title: "Originator / QA/QC",
                  },
                  reviewedBy: {
                    name: "Maintenance Manager",
                    title: "Maintenance Manager",
                  },
                  approvedBy: {
                    name: "Factory Manager / COO",
                    title: "QA/QC Document Control",
                  },
                }))
              : current
              ? [
                  {
                    rev: current.revision ?? 1,
                    date: formatDate(current.effectiveDate ?? current.createdAt),
                    description: current.changeSummary || "APPROVED FOR USE",
                    preparedBy: {
                      name: current.preparedByName || "Originator",
                      title: "Originator / QA/QC",
                    },
                    reviewedBy: {
                      name: "Maintenance Manager",
                      title: "Maintenance Manager",
                    },
                    approvedBy: {
                      name: "Factory Manager / COO",
                      title: "QA/QC Document Control",
                    },
                  },
                ]
              : []
          }
        />

        <article className="pt-2">
          {current?.contentMarkdown ? (
            <Markdown content={current.contentMarkdown} />
          ) : (
            <p className="text-sm text-ink-400">No approved procedure on record.</p>
          )}
        </article>

        {current?.id && (
          <div className="pt-4 border-t border-line">
            <DocumentSeal entityType="PROCEDURE" entityId={current.id} />
          </div>
        )}
      </div>
    </div>
  );
}
