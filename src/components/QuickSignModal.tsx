// src/components/QuickSignModal.tsx
// Universal inline quick-sign modal for any actionable sign-off step.
//
// Enables 1-click review and signature directly from the Approvals inbox
// without forcing the user to load the full document page and navigate back.
"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import SignatureBlock from "@/components/SignatureBlock";
import { FIELD_CLASS } from "@/components/Field";
import { useSession } from "next-auth/react";
import SegmentedControl from "@/components/SegmentedControl";
import { PIN_LENGTH } from "@/lib/signing-pin";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { invalidateApi } from "@/lib/api-cache";

export type QuickSignTarget = {
  signoffId: string;
  entityType: string;
  entityId: string;
  code: string | null;
  title: string;
  kind: string;
  roleLabel: string;
  stepRole: string;
};

export default function QuickSignModal({
  open,
  onClose,
  target,
  userRole,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  target: QuickSignTarget | null;
  userRole?: string;
  onSuccess?: () => void;
}) {
  const [action, setAction] = useState<"sign" | "reject">("sign");
  const [pin, setPin] = useState("");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const { data: session } = useSession();
  const userName = (session?.user as { name?: string })?.name ?? "You";

  useEffect(() => {
    if (!open) return;
    setAction("sign");
    setPin("");
    setError(null);
    setComments("");
    setOverrideReason("");
    fetch("/api/account/signing-pin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasPin(!!d?.hasPin))
      .catch(() => setHasPin(false));
  }, [open]);

  const [comments, setComments] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!target) return null;

  const isOverride = userRole && userRole !== target.stepRole && userRole !== "SUPER_ADMIN";

  const handleSubmit = async (submitAction: "sign" | "reject", currentPin?: string) => {
    setError(null);
    if (submitAction === "sign") {
      const pinToUse = currentPin || pin;
      if (hasPin && pinToUse.length !== PIN_LENGTH) {
        setError(`Enter your ${PIN_LENGTH}-digit signing PIN.`);
        return;
      }
      if (isOverride && overrideReason.trim().length < 10) {
        setError("Please enter a clear justification for signing on behalf of another role.");
        return;
      }
    } else {
      if (comments.trim().length < 10) {
        setError("Please explain what needs changing (at least a sentence) so the author can revise it.");
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/signoffs/${target.signoffId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: submitAction,
          signingPin: submitAction === "sign" ? currentPin || pin : undefined,
          comments: comments.trim() || undefined,
          overrideReason: overrideReason.trim() || undefined,
        }),
      });

      const d = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(d.error || `Failed to ${submitAction}.`);
        return;
      }

      toast.success(
        submitAction === "sign"
          ? `${target.code ?? target.kind} signed successfully.`
          : `${target.code ?? target.kind} returned for changes.`,
      );

      invalidateApi("/api/approvals");
      invalidateApi("/api/approvals/flows");
      invalidateApi("/api/signoffs");
      invalidateApi("/api/signoffs/mine");
      invalidateApi("/api/dashboard");

      onClose();
      onSuccess?.();
    } catch (err: any) {
      setError(err.message || `Failed to ${submitAction}.`);
    } finally {
      setSaving(false);
    }
  };

  const label = target.code ? `${target.code} · ${target.kind}` : target.kind;

  return (
    <Modal open={open} onClose={onClose} title={`${label} · ${target.roleLabel}`} subtitle={target.title}>
      <div className="space-y-4">
        <SegmentedControl
          ariaLabel="Signature action"
          value={action}
          onChange={setAction}
          options={[
            { value: "sign", label: "Approve & Sign" },
            { value: "reject", label: "Return for changes" },
          ]}
        />

        {error && (
          <div className="p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-xs text-danger-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{error}</p>
          </div>
        )}

        {action === "sign" ? (
          <div className="space-y-4 pt-1">
            {isOverride && (
              <div className="p-3.5 rounded-xl bg-warn-500/10 border border-warn-500/20 text-xs text-warn-800 space-y-2">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-warn-600 shrink-0" />
                  Role delegation / override
                </div>
                <p className="leading-relaxed">
                  You are signing a step designated for <strong>{target.stepRole}</strong> as <strong>{userRole}</strong>.
                  Please provide an operational justification for the audit trail.
                </p>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Covering for absent supervisor per handover log"
                  rows={2}
                  className={`w-full ${FIELD_CLASS} text-xs`}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Optional comments or notes
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Add any verification observations or approval notes..."
                rows={2}
                className={`w-full ${FIELD_CLASS} text-xs`}
              />
            </div>

            <div className="rounded-lg border border-line bg-surface px-4 py-3.5">
              <p className="text-sm font-medium text-ink-700 mb-1.5">You are about to sign as</p>
              <SignatureBlock name={userName} role={target.stepRole} signedAt={new Date().toISOString()} />
            </div>

            {hasPin && (
              <div className="space-y-1">
                <label htmlFor="quick-sign-pin" className="block text-sm font-medium text-ink-700">
                  Signing PIN
                </label>
                <input
                  id="quick-sign-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={PIN_LENGTH}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder={`${PIN_LENGTH} digits`}
                  className={`${FIELD_CLASS} bg-surface w-40 tracking-[0.3em]`}
                />
                <p className="text-xs text-ink-500">Change or remove it in Account settings.</p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={CheckCircle2}
                loading={saving}
                onClick={() => handleSubmit("sign")}
              >
                Sign document
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pt-1">
            <div className="p-3.5 rounded-xl bg-danger-500/10 border border-danger-500/20 text-xs text-danger-800 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-danger-600 shrink-0" />
                Return document for revision
              </div>
              <p className="leading-relaxed">
                This rejects the step and sends the document back to the author with your change instructions.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-700 mb-1">
                Reason for return (required)
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Specify required corrections or missing safety measures..."
                rows={3}
                className={`w-full ${FIELD_CLASS} text-xs`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={XCircle}
                loading={saving}
                onClick={() => handleSubmit("reject")}
              >
                Return document
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
