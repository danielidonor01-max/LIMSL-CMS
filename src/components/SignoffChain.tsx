// src/components/SignoffChain.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { CheckCircle2, Circle, Lock, Loader2, PenLine, ShieldCheck } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import { canSignStep, ROLE_BADGE, ROLE_LABELS } from "@/lib/roles";
import { isStepUnlocked, chainSummary } from "@/lib/signoff/chains";

type Step = {
  id: string;
  stepOrder: number;
  role: string;
  roleLabel: string;
  required: boolean | null;
  status: string;
  signedByName: string | null;
  signedByRole: string | null;
  signatureData: string | null;
  comments: string | null;
  signedAt: string | null;
};

export default function SignoffChain({
  entityType,
  entityId,
  title = "Approval & Sign-off",
}: {
  entityType: string;
  entityId: string;
  title?: string;
}) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const [chain, setChain] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/signoffs?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => r.json())
      .then((d) => setChain(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  useEffect(load, [load]);

  const sign = async (stepId: string) => {
    setError(null);
    if (!sig) {
      setError("Please draw your signature.");
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/signoffs/${stepId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sign", signatureData: sig, comments }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || "Failed to sign");
      return;
    }
    setOpenStep(null);
    setSig(null);
    setComments("");
    load();
  };

  const summary = chainSummary(chain);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" /> {title}
        </h3>
        {!loading && (
          <Badge
            className={
              summary.complete
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-700 border-amber-500/20"
            }
          >
            {summary.complete ? "Fully signed off" : `${summary.signed}/${summary.total} signed`}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
        </div>
      ) : chain.length === 0 ? (
        <p className="text-xs text-slate-400">No sign-off chain configured for this record.</p>
      ) : (
        <ol className="space-y-2">
          {chain.map((step) => {
            const unlocked = isStepUnlocked(chain, step.stepOrder);
            const mine = canSignStep(role, step.role);
            const canSign = step.status === "PENDING" && unlocked && mine;
            const isOpen = openStep === step.id;
            return (
              <li key={step.id} className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {step.status === "SIGNED" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : step.status === "REJECTED" ? (
                      <Circle className="w-5 h-5 text-rose-500 shrink-0" />
                    ) : unlocked ? (
                      <Circle className="w-5 h-5 text-slate-300 shrink-0" />
                    ) : (
                      <Lock className="w-4 h-4 text-slate-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900">{step.roleLabel}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge className={ROLE_BADGE[step.role] ?? "bg-slate-100 text-slate-500 border-slate-200"}>
                          {ROLE_LABELS[step.role] ?? step.role}
                        </Badge>
                        {!step.required && <span className="text-[9px] text-slate-400">optional</span>}
                        {step.status === "SIGNED" && step.signedByName && (
                          <span className="text-[10px] text-slate-500">
                            · {step.signedByName} · {formatDate(step.signedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2">
                    {step.status === "SIGNED" && step.signatureData && (
                      <Image
                        src={step.signatureData}
                        alt="signature"
                        width={90}
                        height={32}
                        unoptimized
                        className="h-8 w-auto bg-slate-50 rounded border border-slate-200"
                      />
                    )}
                    {canSign && !isOpen && (
                      <button
                        onClick={() => {
                          setOpenStep(step.id);
                          setSig(null);
                          setComments("");
                          setError(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                      >
                        <PenLine className="w-3.5 h-3.5" /> Sign
                      </button>
                    )}
                    {step.status === "PENDING" && !unlocked && (
                      <span className="text-[10px] text-slate-400">awaiting earlier steps</span>
                    )}
                    {step.status === "PENDING" && unlocked && !mine && (
                      <span className="text-[10px] text-slate-400">awaiting {ROLE_LABELS[step.role] ?? step.role}</span>
                    )}
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-slate-200 p-3 bg-slate-50/60 space-y-2">
                    <SignaturePad label={`Sign as ${ROLE_LABELS[step.role] ?? step.role}`} onChange={setSig} />
                    <input
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Comments (optional)"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-emerald-500/40"
                    />
                    {error && <p className="text-[11px] text-rose-600">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setOpenStep(null)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => sign(step.id)}
                        disabled={saving || !sig}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Confirm sign-off
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {error && !openStep && <p className="text-[11px] text-rose-600">{error}</p>}
    </div>
  );
}
