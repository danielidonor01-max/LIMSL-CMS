// src/app/procedure/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import Markdown from "@/components/Markdown";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";

export default function ProcedureRevisionPage() {
  const { id } = useParams<{ id: string }>();
  const [rev, setRev] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/procedure/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setRev)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (!rev || rev.error) {
    return (
      <div className="p-10 text-center text-slate-500">
        Revision not found.{" "}
        <Link href="/procedure" className="text-emerald-600 hover:underline">Back to procedure</Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl w-full mx-auto space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href="/procedure" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to current procedure
        </Link>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-8 print:border-0 print:p-0">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
          <div>
            <p className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Controlled Document · Historical</p>
            <p className="text-xs font-semibold text-slate-900">{rev.code}</p>
          </div>
          <div className="text-right">
            <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20">{String(rev.status).replace(/_/g, " ")}</Badge>
            <p className="text-[10px] text-slate-400 mt-1 font-mono">Rev {rev.revision} · {formatDate(rev.effectiveDate ?? rev.createdAt)}</p>
          </div>
        </div>
        <Markdown content={rev.contentMarkdown} />
      </div>
    </div>
  );
}
