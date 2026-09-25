// src/components/SignoffChain.tsx
// The authorisation block. It is the most consequential object on any record
// in this app — it is what an auditor opens the page to look at — and it was
// drawn as four separately bordered boxes of 12px text, which read as a
// footnote rather than as the thing the page is for.
//
// Three changes carry that. It is now ONE panel divided by hairlines, the same
// treatment the sign-in fields use, because a chain is a single object and not
// a list of unrelated controls. The steps are numbered and connected, so the
// order — which is enforced in the engine — is visible rather than implied.
// And the progress is stated as a figure with a meter, so "where has this got
// to" is answered before anything is read.
"use client";

import Button from "@/components/Button";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Check, Lock, Loader2, PenLine, ShieldCheck, Undo2, X } from "lucide-react";
import SignatureBlock from "@/components/SignatureBlock";
import { Badge } from "@/components/Badge";
import Field, { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { formatDate } from "@/lib/utils";
import { canSignStep, ROLE_BADGE, ROLE_LABELS } from "@/lib/roles";
import { isStepUnlocked, chainSummary } from "@/lib/signoff/chains";
import { PIN_LENGTH } from "@/lib/signing-pin";
import { invalidateApi } from "@/lib/api-cache";

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
  title = "Approval & sign-off",
  onChange,
}: {
  entityType: string;
  entityId: string;
  title?: string;
  /** Called after a signature or a return lands, so the page around the
   *  chain can refresh what the signature changed. Without it the chain
   *  moves and everything beside it still says "awaiting". */
  onChange?: () => void;
}) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const userId = (session?.user as { id?: string })?.id;
  const userName = (session?.user as { name?: string })?.name ?? "You";
  const [chain, setChain] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [openStep, setOpenStep] = useState<string | null>(null);
  // Whether THIS signer has chosen to protect their signature with a PIN.
  // null while unknown, so the dialog never flashes a field it is about to
  // remove or omits one it is about to need.
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [comments, setComments] = useState("");
  const [pin, setPin] = useState("");
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

  // Asked once, not per step. The answer decides whether the dialog shows a PIN
  // field at all, and the server decides the same thing from the stored hash.
  useEffect(() => {
    fetch("/api/account/signing-pin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasPin(!!d?.hasPin))
      .catch(() => setHasPin(false));
  }, []);

  const sign = async (stepId: string) => {
    setError(null);
    if (hasPin && pin.length !== PIN_LENGTH) {
      setError(`Enter your ${PIN_LENGTH}-digit signing PIN.`);
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
        signingPin: action === "sign" ? pin : undefined,
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
    setPin("");
    setComments("");
    setOverrideReason("");
    invalidateApi("/api/signoffs");
    invalidateApi("/api/dashboard");
    invalidateApi("/api/work-orders");
    invalidateApi("/api/permits");
    invalidateApi("/api/jha");
    invalidateApi("/api/corrective");
    invalidateApi("/api/approvals");
    load();
    onChange?.();
  };

  const summary = chainSummary(chain);
  const pct = summary.total ? Math.round((summary.signed / summary.total) * 100) : 0;
  // The order comes from the chain itself rather than from a sentence somebody
  // typed into the title. A hand-written order line drifts from chains.ts the
  // first time a step moves, and nothing says so.
  const sequence = chain.map((s) => ROLE_LABELS[s.role] ?? s.role).join(" → ");

  return (
    <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
      <header className="px-6 py-4 border-b border-line">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand-600 shrink-0" />
              {title}
            </h3>
            {!loading && sequence && (
              <p className="text-xs text-ink-500 mt-1 leading-relaxed">{sequence}</p>
            )}
          </div>

          {!loading && summary.total > 0 && (
            <div className="shrink-0 w-40">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-ink-900 tabular-nums">
                  {summary.signed} of {summary.total}
                </span>
                <span className={`text-xs ${summary.complete ? "text-brand-700" : "text-ink-500"}`}>
                  {summary.complete ? "fully signed" : "signed"}
                </span>
              </div>
              {/* A meter rather than a pill. "3/4 signed" is a fact; how much of
                  the chain is left is the question people actually ask. */}
              <div
                className="mt-1.5 h-1 rounded-full bg-ink-200 overflow-hidden"
                role="progressbar"
                aria-valuenow={summary.signed}
                aria-valuemin={0}
                aria-valuemax={summary.total}
                aria-label="Signatures collected"
              >
                <div
                  className={`h-full rounded-full transition-all ${summary.complete ? "bg-brand-600" : "bg-warn-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {loading ? (
        <div className="py-12 flex items-center justify-center text-ink-400">
          <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
        </div>
      ) : chain.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-ink-500">
          No sign-off chain is configured for this record.
        </p>
      ) : (
        <ol className="divide-y divide-line">
          {chain.map((step, i) => {
            const unlocked = isStepUnlocked(chain, step.stepOrder);
            // A person-bound step belongs to one named individual, not to a
            // role. Showing it as signable to every technician invites them to
            // click and be refused.
            const mine = step.signerUserId
              ? step.signerUserId === userId || role === "SUPER_ADMIN"
              : canSignStep(role, step.role);
            const returned = step.status === "REJECTED";
            const signed = step.status === "SIGNED";
            const canSign = (step.status === "PENDING" || returned) && unlocked && mine;
            const isOpen = openStep === step.id;
            // The step that is actually waiting on somebody, which is the one
            // the eye should land on when the page opens.
            const current = !signed && unlocked && !returned;

            return (
              <li key={step.id} className={current && !isOpen ? "bg-brand-50/40" : undefined}>
                <div className="px-6 py-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <StepMarker index={i + 1} signed={signed} returned={returned} unlocked={unlocked} />

                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-900 leading-snug">{step.roleLabel}</p>

                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <Badge className={ROLE_BADGE[step.role] ?? "bg-ink-100 text-ink-500 border-ink-200"}>
                          {ROLE_LABELS[step.role] ?? step.role}
                        </Badge>
                        {step.signerUserName && (
                          <span className="text-xs text-ink-600">{step.signerUserName} only</span>
                        )}
                        {!step.required && <span className="text-xs text-ink-500">Optional</span>}
                      </div>

                      {signed && step.signedByName && (
                        <p className="text-xs text-ink-500 mt-1.5">
                          Signed by {step.signedByName} · {formatDate(step.signedAt)}
                        </p>
                      )}

                      {/* An exception has to look like one. Reading the chain,
                          nobody should have to compare two role fields to
                          notice that somebody else signed this step. */}
                      {step.isOverride && (
                        <div className="mt-2 rounded-lg bg-warn-50 border border-warn-200 px-3 py-2">
                          <p className="text-xs font-semibold text-warn-900">
                            Signed in place of {ROLE_LABELS[step.role] ?? step.role} by{" "}
                            {ROLE_LABELS[step.signedByRole ?? ""] ?? step.signedByRole}
                          </p>
                          {step.overrideReason && (
                            <p className="text-xs text-warn-800 mt-1 leading-relaxed">{step.overrideReason}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    {signed && (
                      <SignatureBlock
                        name={step.signedByName}
                        role={step.signedByRole ?? step.role}
                        signedAt={step.signedAt}
                        drawn={step.signatureData}
                        className="hidden sm:block max-w-[13rem]"
                      />
                    )}
                    {canSign && !isOpen && (
                      <Button
                        onClick={() => {
                          setOpenStep(step.id);
                          setComments("");
                          setPin("");
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
                      <span className="text-xs text-ink-500">Awaiting earlier steps</span>
                    )}
                    {step.status === "PENDING" && unlocked && !mine && (
                      <span className="text-xs text-ink-600">
                        Awaiting {ROLE_LABELS[step.role] ?? step.role}
                      </span>
                    )}
                  </div>
                </div>

                {returned && step.comments && (
                  <div className="border-t border-danger-200 bg-danger-50 px-6 py-3">
                    <p className="text-xs font-semibold text-danger-700">
                      Returned by {step.signedByName ?? "the approver"}
                    </p>
                    <p className="text-xs text-danger-700/90 mt-1 leading-relaxed">{step.comments}</p>
                  </div>
                )}

                {isOpen && (
                  <div className="border-t border-line bg-ink-50 px-6 py-5 space-y-4">
                    <p className="text-sm font-semibold text-ink-900">
                      Sign as {ROLE_LABELS[step.role] ?? step.role}
                    </p>

                    {/* The signature itself.
                        It is not drawn any more. A fingertip scrawl on a
                        tablet is not comparable to a wet signature and cannot
                        be verified against anything; what it did was make the
                        act feel deliberate. So the act is deliberate in a way
                        that also carries evidence: the signer reads back their
                        own name, the role they are signing as, and the moment,
                        and the record stores exactly that. */}
                    <div className="rounded-lg border border-line bg-surface px-4 py-3.5">
                      <p className={LABEL_CLASS}>You are about to sign as</p>
                      <SignatureBlock name={userName} role={step.role} signedAt={new Date().toISOString()} />
                    </div>

                    {/* Signing a step your role does not name is an exception.
                        Asking for the reason here, before the signature, makes
                        it a deliberate act rather than something discovered in
                        the audit trail six months later. */}
                    {role && role !== step.role && (
                      <div className="rounded-lg border border-warn-200 bg-warn-50 p-3 space-y-2">
                        <p className="text-xs text-warn-900 leading-relaxed">
                          This step names <strong>{ROLE_LABELS[step.role] ?? step.role}</strong>. You may sign it,
                          but it will be recorded as an override against your name.
                        </p>
                        <input
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="Why are you signing in their place?"
                          aria-label="Reason for signing in place of the named role"
                          className={`${FIELD_CLASS} bg-surface border-warn-300 focus:border-warn-500 focus:ring-warn-500/15`}
                        />
                      </div>
                    )}

                    {/* Only for signers who have chosen one. The server decides
                        the same thing from the stored hash, so this cannot ask
                        for something that will be ignored, or omit something
                        that will be demanded. */}
                    {hasPin && (
                      <Field
                        label="Signing PIN"
                        htmlFor={`pin-${step.id}`}
                        help="Yours alone. Change or remove it in Account settings."
                      >
                        <input
                          id={`pin-${step.id}`}
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_LENGTH))}
                          inputMode="numeric"
                          autoComplete="off"
                          type="password"
                          placeholder={`${PIN_LENGTH} digits`}
                          className={`${FIELD_CLASS} bg-surface w-40 tracking-[0.3em]`}
                        />
                      </Field>
                    )}

                    {/* A textarea, not a single line. The field is asked to
                        carry a sentence explaining what has to change, and a
                        one-line box says "a few words will do". */}
                    <Field
                      label="Comments"
                      htmlFor={`comments-${step.id}`}
                      help="Required if you are returning this — say what needs changing."
                    >
                      <textarea
                        id={`comments-${step.id}`}
                        rows={2}
                        value={comments}
                        onChange={(e) => setComments(e.target.value)}
                        placeholder="Anything the next signer or an auditor should know"
                        className={`${FIELD_CLASS} bg-surface resize-none`}
                      />
                    </Field>

                    {error && (
                      <p className="text-xs text-danger-600" role="alert">
                        {error}
                      </p>
                    )}

                    {/* Approve or send back. Before this the only alternative to
                        signing was cancelling the whole record, so a supervisor
                        who wanted a small correction had to either wave it
                        through or destroy it. */}
                    <div className="flex flex-wrap justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" icon={X} onClick={() => setOpenStep(null)}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => reject(step.id)} loading={saving} icon={Undo2}>
                        Return with comment
                      </Button>
                      <Button size="sm" onClick={() => sign(step.id)} loading={saving} icon={Check}>
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

      {error && !openStep && (
        <p className="px-6 py-3 text-xs text-danger-600" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

// The marker carries the step's number AND its state, so the order is legible
// without reading a word. A ring rather than a fill for the step in hand: it
// marks position without competing with the Sign button beside it.
function StepMarker({
  index,
  signed,
  returned,
  unlocked,
}: {
  index: number;
  signed: boolean;
  returned: boolean;
  unlocked: boolean;
}) {
  const base = "w-7 h-7 rounded-full shrink-0 grid place-items-center text-xs font-semibold";
  if (signed) {
    return (
      <span className={`${base} bg-brand-600 text-white`} aria-label={`Step ${index}, signed`}>
        <Check className="w-4 h-4" aria-hidden="true" />
      </span>
    );
  }
  if (returned) {
    return (
      <span
        className={`${base} bg-danger-50 text-danger-700 border border-danger-300`}
        aria-label={`Step ${index}, returned`}
      >
        <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
    );
  }
  if (!unlocked) {
    return (
      <span
        className={`${base} bg-ink-100 text-ink-400 border border-line`}
        aria-label={`Step ${index}, locked until earlier steps are signed`}
      >
        <Lock className="w-3.5 h-3.5" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-surface text-brand-700 border border-brand-400 ring-2 ring-brand-500/15`}
      aria-label={`Step ${index}, awaiting signature`}
    >
      {index}
    </span>
  );
}
