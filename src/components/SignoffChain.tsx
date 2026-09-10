// src/components/SignoffChain.tsx
"use client";

import Button from "@/components/Button";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { CheckCircle2, Circle, Lock, Loader2, PenLine, ShieldCheck, Undo2 } from "lucide-react";
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
  signerUserId: string | null;
  signerUserName: string | null;
  status: string;
  signedByName: string | null;
  signedByRole: string | null;
  isOverride: boolean | null;
  overrideReason: string | null;
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
  const userId = (session?.user as { id?: string })?.id;
  const [chain, setChain] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
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
    await submit(stepId, "sign");
  };

  // Sending it back. No signature is asked for, because a rejection is not
  // something anybody signs; it is a note saying what has to change first.
  const reject = async (stepId: string) => {
    setError(null);
    if (comments.trim().length < 10) {
      setError("Say what needs changing, in a sentence. It goes back to whoever raised it.");
      return;
    }
    await submit(stepId, "reject");
  };

  const submit = async (stepId: string, action: "sign" | "reject") => {
    setSaving(true);
    const res = await fetch(`/api/signoffs/${stepId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        signatureData: action === "sign" ? sig : undefined,
        comments,
        overrideReason,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setError(d.error || (action === "reject" ? "Failed to return" : "Failed to sign"));
      return;
    }
    setOpenStep(null);
    setSig(null);
    setComments("");
    setOverrideReason("");
    load();
  };

  const summary = chainSummary(chain);

  return (
    <div className="bg-surface border border-line rounded-2xl shadow-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-brand-600" /> {title}
        </h3>
        {!loading && (
          <Badge
            className={
              summary.complete
                ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                : "bg-warn-500/10 text-warn-700 border-warn-500/20"
            }
          >
            {summary.complete ? "Fully signed off" : `${summary.signed}/${summary.total} signed`}
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex items-center justify-center text-ink-400">
          <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
        </div>
      ) : chain.length === 0 ? (
        <p className="text-xs text-ink-400">No sign-off chain configured for this record.</p>
      ) : (
        <ol className="space-y-2">
          {chain.map((step) => {
            const unlocked = isStepUnlocked(chain, step.stepOrder);
            // A person-bound step belongs to one named individual, not to a
            // role. Showing it as signable to every technician invites them to
            // click and be refused.
            const mine = step.signerUserId
              ? step.signerUserId === userId || role === "SUPER_ADMIN"
              : canSignStep(role, step.role);
            const returned = step.status === "REJECTED";
            const canSign = (step.status === "PENDING" || returned) && unlocked && mine;
            const isOpen = openStep === step.id;
            return (
              <li key={step.id} className="border border-ink-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {step.status === "SIGNED" ? (
                      <CheckCircle2 className="w-5 h-5 text-brand-600 shrink-0" />
                    ) : step.status === "REJECTED" ? (
                      <Circle className="w-5 h-5 text-danger-500 shrink-0" />
                    ) : unlocked ? (
                      <Circle className="w-5 h-5 text-ink-300 shrink-0" />
                    ) : (
                      <Lock className="w-4 h-4 text-ink-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink-900">{step.roleLabel}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge className={ROLE_BADGE[step.role] ?? "bg-ink-100 text-ink-500 border-ink-200"}>
                          {ROLE_LABELS[step.role] ?? step.role}
                        </Badge>
                        {step.signerUserName && (
                          <span className="text-[11px] font-medium text-ink-600">
                            {step.signerUserName} only
                          </span>
                        )}
                        {!step.required && <span className="text-[10px] text-ink-400">optional</span>}
                        {step.status === "SIGNED" && step.signedByName && (
                          <span className="text-[11px] text-ink-500">
                            · {step.signedByName} · {formatDate(step.signedAt)}
                          </span>
                        )}
                      </div>

                      {/* An exception has to look like one. Reading the chain,
                          nobody should have to compare two role fields to
                          notice that somebody else signed this step. */}
                      {step.isOverride && (
                        <div className="mt-1.5 rounded-md bg-warn-50 border border-warn-200 px-2 py-1.5">
                          <p className="text-[11px] font-semibold text-warn-900">
                            Signed in place of {ROLE_LABELS[step.role] ?? step.role} by{" "}
                            {ROLE_LABELS[step.signedByRole ?? ""] ?? step.signedByRole}
                          </p>
                          {step.overrideReason && (
                            <p className="text-[11px] text-warn-800 mt-0.5 leading-relaxed">
                              {step.overrideReason}
                            </p>
                          )}
                        </div>
                      )}
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
                        className="h-8 w-auto bg-ink-50 rounded border border-ink-200"
                      />
                    )}
                    {canSign && !isOpen && (
                      <Button
                        onClick={() => {
                          setOpenStep(step.id);
                          setSig(null);
                          setComments("");
                          setError(null);
                        }}
                        icon={PenLine}
                        size="sm"
                        variant={returned ? "secondary" : "primary"}
                      >
                        {returned ? "Review again" : "Sign"}
                      </Button>
                    )}
                    {step.status === "PENDING" && !unlocked && (
                      <span className="text-[11px] text-ink-400">awaiting earlier steps</span>
                    )}
                    {step.status === "PENDING" && unlocked && !mine && (
                      <span className="text-[11px] text-ink-400">awaiting {ROLE_LABELS[step.role] ?? step.role}</span>
                    )}
                  </div>
                </div>

                {returned && step.comments && (
                  <div className="border-t border-danger-200 bg-danger-50 px-3 py-2.5">
                    <p className="text-xs font-semibold text-danger-700">
                      Returned by {step.signedByName ?? "the approver"}
                    </p>
                    <p className="text-xs text-danger-700/90 mt-0.5 leading-relaxed">{step.comments}</p>
                  </div>
                )}

                {isOpen && (
                  <div className="border-t border-ink-200 p-3 bg-ink-50/60 space-y-2">
                    <SignaturePad label={`Sign as ${ROLE_LABELS[step.role] ?? step.role}`} onChange={setSig} />

                    {/* Signing a step your role does not name is an exception.
                        Asking for the reason here, before the signature, makes
                        it a deliberate act rather than something discovered in
                        the audit trail six months later. */}
                    {role && role !== step.role && (
                      <div className="rounded-lg border border-warn-200 bg-warn-50 p-2.5 space-y-1.5">
                        <p className="text-xs text-warn-900 leading-relaxed">
                          This step names <strong>{ROLE_LABELS[step.role] ?? step.role}</strong>. You may sign it, but
                          it will be recorded as an override against your name.
                        </p>
                        <input
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Why are you signing in their place?"
                          aria-label="Reason for signing in place of the named role"
                          className="w-full px-3 py-1.5 bg-white border border-warn-300 rounded-lg text-xs text-ink-900 focus:outline-none focus:border-warn-500"
                        />
                      </div>
                    )}

                    <input
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Comments, or what needs changing if you are returning it"
                      aria-label="Comments"
                      className="w-full px-3 py-1.5 bg-white border border-ink-200 rounded-lg text-xs text-ink-900 focus:outline-none focus:border-brand-500/40"
                    />
                    {error && <p className="text-xs text-danger-600">{error}</p>}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setOpenStep(null)}
                        className="px-3 py-1.5 text-xs font-semibold text-ink-600 border border-ink-200 rounded-lg hover:bg-ink-100"
                      >
                        Cancel
                      </button>
                      {/* Approve or send back. Before this the only
                          alternative to signing was cancelling the whole record,
                          so a supervisor who wanted a small correction had to
                          either wave it through or destroy it. */}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => reject(step.id)}
                        loading={saving}
                        icon={Undo2}
                      >
                        Return with comment
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => sign(step.id)}
                        disabled={!sig}
                        loading={saving}
                        icon={CheckCircle2}
                      >
                        Confirm sign-off
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {error && !openStep && <p className="text-xs text-danger-600">{error}</p>}
    </div>
  );
}
