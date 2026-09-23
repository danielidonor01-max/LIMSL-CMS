// src/components/WorkOrderQuickSignModal.tsx
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

type QuickSignStep = {
  id: string;
  stepOrder: number;
  role: string;
  roleLabel: string;
};

export default function WorkOrderQuickSignModal({
  open,
  onClose,
  workOrderId,
  workOrderNumber,
  workOrderTitle,
  step,
  userRole,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  step: QuickSignStep | null;
  userRole?: string;
  onSuccess?: () => void;
}) {
  const [action, setAction] = useState<"sign" | "reject">("sign");
  const [pin, setPin] = useState("");
  // Whether this signer has opted into a PIN. The server decides the same thing
  // from the stored hash; asking keeps the dialog from showing a field that
  // will be ignored, or hiding one that will be demanded.
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const { data: session } = useSession();
  const userName = (session?.user as { name?: string })?.name ?? "You";

  // Asked when the dialog opens, so the PIN field matches what the server will
  // actually enforce for this signer.
  useEffect(() => {
    if (!open) return;
    fetch("/api/account/signing-pin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasPin(!!d?.hasPin))
      .catch(() => setHasPin(false));
  }, [open]);
  const [comments, setComments] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!step) return null;

  const isOverride = userRole && userRole !== step.role && userRole !== "SUPER_ADMIN";

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
      const res = await fetch(`/api/signoffs/${step.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: submitAction,
          signingPin: submitAction === "sign" ? (currentPin || pin) : undefined,
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
          ? `${workOrderNumber} sign-off completed.`
          : `${workOrderNumber} returned for revision.`,
      );

      invalidateApi("/api/work-orders");
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${workOrderNumber} · ${step.roleLabel}`}
      subtitle={workOrderTitle}
    >
      <div className="space-y-4">
        {/* Sign, or send it back. One shared control rather than a fifth
            hand-rolled pill strip. */}
        <SegmentedControl
          ariaLabel="What you are about to do"
          value={action}
          onChange={(v) => { setAction(v); setError(null); }}
          className="w-full"
          options={[
            { value: "sign" as const, label: "Sign approval", icon: CheckCircle2 },
            { value: "reject" as const, label: "Return for revision", icon: XCircle },
          ]}
        />

        {error && (
          <div className="p-3 bg-danger-500/10 border border-danger-500/20 text-danger-700 rounded-lg text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {action === "sign" ? (
          <div className="space-y-3">
            {/* The signature. Typed and attributed rather than drawn: a
                fingertip scrawl cannot be verified against anything, and what
                carries the evidence is the name, the role, the moment and the
                audit row — which are stored either way. */}
            <div className="rounded-lg border border-line bg-surface px-4 py-3.5">
              <p className="text-sm font-medium text-ink-700 mb-1.5">You are about to sign as</p>
              <SignatureBlock name={userName} role={step.role} signedAt={new Date().toISOString()} />
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

                {isOverride && (
                  <div className="space-y-1 p-2.5 bg-ink-50 border border-ink-200 rounded-lg">
                    <label className="text-xs font-semibold text-ink-800 flex items-center gap-1">
                      Override Justification *
                    </label>
                    <input
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      placeholder={`State why you are signing for ${step.roleLabel}...`}
                      className="w-full p-1.5 bg-white border border-ink-200 rounded text-xs text-ink-900 focus:outline-none"
                    />
                  </div>
                )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={() => handleSubmit("sign")}
                loading={saving}
                icon={CheckCircle2}
              >
                Sign & Approve
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-ink-700">
                Reason for Rejection / Revision Instructions *
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Explain what is missing or needs updating so the work order can be corrected..."
                rows={4}
                className="w-full p-2.5 bg-ink-100 border border-ink-200 rounded-lg text-xs text-ink-900 focus:outline-none focus:border-danger-500/40"
              />
              <p className="text-[11px] text-ink-400">
                This note will be sent directly to the person who raised the work order.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => handleSubmit("reject")}
                loading={saving}
                icon={XCircle}
              >
                Reject & Return
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
