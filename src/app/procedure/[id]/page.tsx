// src/app/procedure/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { PAGE_MAIN } from "@/lib/page-shell";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import Markdown from "@/components/Markdown";
import DocumentSeal from "@/components/DocumentSeal";
import WmsDocumentHeader from "@/components/WmsDocumentHeader";
import { useDocumentHistory } from "@/lib/use-document-history";

export default function ProcedureRevisionPage() {
  const { id } = useParams<{ id: string }>();
  const [rev, setRev] = useState<any>(null);
  const [allRevs, setAllRevs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/procedure/${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/procedure`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([single, parent]) => {
        setRev(single);
        if (parent?.revisions) setAllRevs(parent.revisions);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // This revision's history: everything issued up to and including it, so an
  // old revision's printout shows the record as it stood then.
  const issued = rev && !rev.error
    ? (allRevs.length > 0 ? allRevs : [rev]).filter(
        (r) => r.status !== "REJECTED" && r.status !== "DRAFT" && (r.revision ?? 0) <= (rev.revision ?? 0),
      )
    : [];
  const history = useDocumentHistory("PROCEDURE", issued);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-ink-500">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
      </div>
    );
  }
  if (!rev || rev.error) {
    return (
      <div className="p-10 text-center text-ink-500">
        Revision not found.{" "}
        <Link href="/procedure" className="text-brand-600 hover:underline">Back to procedure</Link>
      </div>
    );
  }


  return (
    <div className={PAGE_MAIN.detail}>
      <div className="no-print flex items-center justify-between">
        <Link href="/procedure" className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-900">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to current procedure
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 border border-ink-200 text-ink-700 hover:bg-ink-100 rounded-lg text-xs font-semibold">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div className="bg-surface border border-line rounded-xl shadow-card p-6 md:p-8 print:border-0 print:p-0 space-y-6">
        <WmsDocumentHeader
          docNumber={rev.code}
          title={rev.title}
          rows={history.rows}
          loading={history.loading}
        />

        <article className="pt-2">
          <Markdown content={rev.contentMarkdown} />
        </article>

        {rev.status === "APPROVED" && (
          <div className="pt-4 border-t border-line">
            <DocumentSeal entityType="PROCEDURE" entityId={rev.id} />
          </div>
        )}
      </div>
    </div>
  );
}
