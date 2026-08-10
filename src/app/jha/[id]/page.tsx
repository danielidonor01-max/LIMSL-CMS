// src/app/jha/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
  FileText,
  Wrench,
  ShieldCheck,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import SignoffChain from "@/components/SignoffChain";
import { formatDate } from "@/lib/utils";
import { PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { PPE_REQUIREMENTS } from "@/lib/hse/permit-form";

type StepRow = {
  step?: string;
  hazards?: string;
  controls?: string;
  residualRisk?: string;
  responsible?: string;
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-500/10 text-slate-600 border-slate-500/20",
  UNDER_REVIEW: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  APPROVED: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  REJECTED: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  SUPERSEDED: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};

const RISK_BADGE: Record<string, string> = {
  LOW: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  MEDIUM: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  HIGH: "bg-rose-500/10 text-rose-700 border-rose-500/20",
};

const PPE_LABELS: Record<string, string> = Object.fromEntries(
  PPE_REQUIREMENTS.map((p) => [p.key, p.label]),
);

export default function JhaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const canRaisePermit = mounted && PERMIT_ISSUE_ROLES.includes(role ?? "");
  const [jha, setJha] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/jha/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setJha(d))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!jha || jha.error) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <div className="p-16 text-center text-slate-500">
          Job hazard analysis not found.{" "}
          <Link href="/jha" className="text-emerald-600 hover:underline">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  const steps: StepRow[] = (() => {
    try {
      const p = JSON.parse(jha.steps ?? "[]");
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  })();

  const ppe: string[] = (() => {
    try {
      const p = JSON.parse(jha.ppeRequired ?? "[]");
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  })();

  const approved = jha.status === "APPROVED";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto space-y-6">
        <Link
          href="/jha"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 no-print"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to hazard analyses
        </Link>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-lg font-bold text-emerald-600">{jha.jhaNumber}</span>
                {(jha.revision ?? 0) > 0 && (
                  <span className="text-[11px] text-slate-400">rev {jha.revision}</span>
                )}
                <Badge className={STATUS_BADGE[jha.status] ?? STATUS_BADGE.DRAFT}>
                  {String(jha.status).replace(/_/g, " ").toLowerCase()}
                </Badge>
              </div>
              <h2 className="text-xl font-bold tracking-tight mt-2">{jha.title}</h2>
              <p className="text-[11px] text-slate-500 mt-1">
                Prepared by {jha.preparedByName ?? "-"}
                {jha.preparedDate && ` on ${formatDate(jha.preparedDate)}`}
                {jha.workArea && ` · ${jha.workArea}`}
              </p>
            </div>

            <div className="flex flex-col gap-2 shrink-0 no-print">
              <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
              {approved && canRaisePermit && (
                <Button href={`/permits/new?jhaId=${jha.id}`} icon={ShieldCheck}>
                  Raise Permit
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-200">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Work order</p>
              {jha.workOrder ? (
                <Link
                  href={`/work-orders/${jha.workOrder.id}`}
                  className="text-xs font-mono text-emerald-600 hover:underline"
                >
                  {jha.workOrder.workOrderNumber}
                </Link>
              ) : (
                <p className="text-xs text-slate-400">-</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Method statement</p>
              {jha.wms ? (
                <Link href={`/wms/${jha.wms.id}`} className="text-xs font-mono text-emerald-600 hover:underline">
                  <FileText className="w-3 h-3 inline mr-1" />
                  {jha.wms.wmsNumber}
                </Link>
              ) : (
                <p className="text-xs text-slate-400">-</p>
              )}
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Machine</p>
              <p className="text-xs text-slate-700">
                {jha.equipment ? (
                  <>
                    <Wrench className="w-3 h-3 inline mr-1 text-slate-400" />
                    {jha.equipment.name}
                  </>
                ) : (
                  "Not machine-specific"
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-600" /> Job steps, hazards and controls
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left font-semibold py-2.5 px-4 w-10">#</th>
                  <th className="text-left font-semibold py-2.5 px-4">Job step</th>
                  <th className="text-left font-semibold py-2.5 px-4">Hazards</th>
                  <th className="text-left font-semibold py-2.5 px-4">Controls</th>
                  <th className="text-left font-semibold py-2.5 px-4">Residual</th>
                  <th className="text-left font-semibold py-2.5 px-4">Responsible</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {steps.map((s, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-3 px-4 font-mono text-slate-400">{i + 1}</td>
                    <td className="py-3 px-4 text-slate-900 font-medium">{s.step ?? "-"}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-pre-line">{s.hazards ?? "-"}</td>
                    <td className="py-3 px-4 text-slate-600 whitespace-pre-line">{s.controls ?? "-"}</td>
                    <td className="py-3 px-4">
                      <Badge className={RISK_BADGE[s.residualRisk ?? "LOW"] ?? RISK_BADGE.LOW}>
                        {(s.residualRisk ?? "LOW").toLowerCase()}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{s.responsible || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {(ppe.length > 0 || jha.emergencyArrangements) && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            {ppe.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  PPE required
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {ppe.map((k) => (
                    <Badge key={k} className="bg-slate-100 text-slate-700 border-slate-200">
                      {PPE_LABELS[k] ?? k}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {jha.emergencyArrangements && (
              <div>
                <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Emergency arrangements
                </h3>
                <p className="text-xs text-slate-700 whitespace-pre-line">{jha.emergencyArrangements}</p>
              </div>
            )}
          </div>
        )}

        <SignoffChain entityType="JHA" entityId={String(id)} title="Hazard Analysis Approval" />
      </main>
    </div>
  );
}
