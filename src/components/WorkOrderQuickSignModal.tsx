// src/components/WorkOrderQuickSignModal.tsx
"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import SignaturePad from "@/components/SignaturePad";
import { validatePin, PIN_LENGTH } from "@/lib/signing-pin";
import { CheckCircle2, XCircle, AlertTriangle, ShieldCheck, Loader2 } from "lucide-react";
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
  const [sig, setSig] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [needsPin, setNeedsPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [comments, setComments] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!step) return null;

  const isOverride = userRole && userRole !== step.role && userRole !== "SUPER_ADMIN";

  const handleSetupPin = async () => {
    setError(null);
    const check = validatePin(newPin);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    if (newPin !== confirmPin) {
      setError("The two PINs do not match.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/signing-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || "Could not set your signing PIN.");
        return;
      }
      setPin(newPin);
      setNewPin("");
      setConfirmPin("");
      setNeedsPin(false);
      toast.success("Signing PIN set.");
      if (sig) await handleSubmit("sign", newPin);
    } catch {
      setError("Failed to set signing PIN.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (submitAction: "sign" | "reject", currentPin?: string) => {
    setError(null);
    if (submitAction === "sign") {
      if (!sig) {
        setError("Please draw your signature in the box.");
        return;
      }
      const pinToUse = currentPin || pin;
      if (pinToUse.length !== PIN_LENGTH) {
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
          signatureData: submitAction === "sign" ? sig : undefined,
          signingPin: submitAction === "sign" ? (currentPin || pin) : undefined,
          comments: comments.trim() || undefined,
          overrideReason: overrideReason.trim() || undefined,
        }),
      });

      const d = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (d.requiresPinSetup) {
          setNeedsPin(true);
          setError(d.error);
          return;
        }
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
        {/* Action Toggle */}
        <div className="grid grid-cols-2 p-1 bg-ink-100 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setAction("sign"); setError(null); }}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              action === "sign" ? "bg-white text-brand-700 shadow-card" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Sign Approval
          </button>
          <button
            type="button"
            onClick={() => { setAction("reject"); setError(null); }}
            className={`py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
              action === "reject" ? "bg-white text-danger-700 shadow-card" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            <XCircle className="w-3.5 h-3.5" /> Reject / Request Revision
          </button>
        </div>

        {error && (
          <div className="p-3 bg-danger-500/10 border border-danger-500/20 text-danger-700 rounded-lg text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{error}</div>
          </div>
        )}

        {action === "sign" ? (
          <div className="space-y-3">
            {needsPin ? (
              <div className="p-3 bg-warn-50 border border-warn-200 rounded-lg space-y-2 text-xs">
                <p className="font-semibold text-warn-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-warn-700" /> Set your signing PIN
                </p>
                <p className="text-warn-800">
                  Set a 4-digit PIN for your account to attest signatures. It is yours alone.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={PIN_LENGTH}
                    placeholder="New 4-digit PIN"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    className="p-2 bg-white border border-warn-300 rounded-lg text-center tracking-widest text-sm focus:outline-none"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={PIN_LENGTH}
                    placeholder="Confirm PIN"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    className="p-2 bg-white border border-warn-300 rounded-lg text-center tracking-widest text-sm focus:outline-none"
                  />
                </div>
                <Button size="sm" onClick={handleSetupPin} loading={saving} className="w-full">
                  Save PIN & Continue
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <SignaturePad label="Drawn Signature *" onChange={setSig} />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-ink-700">Signing PIN ({PIN_LENGTH} digits) *</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={PIN_LENGTH}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••"
                    className="w-full p-2 bg-ink-100 border border-ink-200 rounded-lg text-sm text-center tracking-widest text-ink-900 focus:outline-none focus:border-brand-500"
                  />
                </div>

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
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button
                onClick={() => handleSubmit("sign")}
                loading={saving}
                disabled={needsPin}
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
