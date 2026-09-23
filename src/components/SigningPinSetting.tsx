// src/components/SigningPinSetting.tsx
// The signing PIN, set and unset by the person it belongs to.
//
// It is OPTIONAL, and the decision lives here rather than in a signing dialog
// because it is a decision about where you work, not about the document in
// front of you.
//
// A signature already records who signed, the role they signed as, the moment,
// and an audit row naming them. All of that holds with or without a PIN. What
// the PIN adds is one specific claim: that the account holder was at the
// keyboard, rather than whoever picked up a tablet somebody left logged in. On
// a shared workshop tablet that is worth six digits a signature. On somebody's
// own laptop it reasonably is not.
//
// Nobody else can set it — there is no route that takes a user id. A PIN an
// administrator can set is a PIN an administrator can sign with, which is the
// one thing it exists to prevent.
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";
import Button from "@/components/Button";
import { Badge } from "@/components/Badge";
import Field, { FIELD_CLASS } from "@/components/Field";
import { validatePin, PIN_LENGTH } from "@/lib/signing-pin";

export default function SigningPinSetting() {
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [mode, setMode] = useState<"idle" | "set" | "remove">("idle");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    fetch("/api/account/signing-pin")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHasPin(!!d?.hasPin))
      .catch(() => setHasPin(false));

  useEffect(() => {
    load();
  }, []);

  const reset = () => {
    setMode("idle");
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setError(null);
  };

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, PIN_LENGTH);

  const save = async () => {
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
    setBusy(true);
    try {
      const res = await fetch("/api/account/signing-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: newPin, currentPin: hasPin ? currentPin : undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Could not save the signing PIN.");
        return;
      }
      toast.success(
        hasPin ? "Signing PIN changed." : "Signing PIN set. It is yours alone and cannot be recovered.",
      );
      reset();
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/account/signing-pin", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPin }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d.error || "Could not remove the signing PIN.");
        return;
      }
      toast.success("Signing PIN removed. Your signatures now rest on your sign-in alone.");
      reset();
      load();
    } finally {
      setBusy(false);
    }
  };

  // Nothing at all until the answer is known: a control that says "Off" and
  // then corrects itself to "On" has told the user something untrue.
  if (hasPin === null) return null;

  return (
    <div className="mt-3 rounded-lg border border-ink-200">
      <div className="flex items-start justify-between gap-4 p-3">
        <div className="flex items-start gap-3 min-w-0">
          <ShieldCheck className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-900">Signing PIN</p>
            <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
              Optional. With one set you type it each time you sign, which proves it was you rather than
              whoever last used the tablet. It is not your login password, and it cannot be recovered.
            </p>
          </div>
        </div>
        <Badge
          className={
            hasPin
              ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
              : "bg-ink-500/10 text-ink-600 border-ink-500/20"
          }
        >
          {hasPin ? "On" : "Off"}
        </Badge>
      </div>

      {mode === "idle" ? (
        <div className="flex flex-wrap gap-2 px-3 pb-3">
          <Button size="sm" variant="secondary" onClick={() => setMode("set")}>
            {hasPin ? "Change PIN" : "Set a PIN"}
          </Button>
          {hasPin && (
            <Button size="sm" variant="ghost" onClick={() => setMode("remove")}>
              Turn it off
            </Button>
          )}
        </div>
      ) : (
        <div className="border-t border-ink-200 bg-ink-50 px-3 py-3 space-y-3">
          {/* Changing it and removing it both prove knowledge of the current
              one. Without that, a tablet left logged in is a way to take over
              somebody else's signature. */}
          {hasPin && (
            <Field label="Current PIN" htmlFor="pin-current">
              <input
                id="pin-current"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={currentPin}
                onChange={(e) => setCurrentPin(digits(e.target.value))}
                placeholder={`${PIN_LENGTH} digits`}
                className={`${FIELD_CLASS} bg-surface w-40 tracking-[0.3em]`}
              />
            </Field>
          )}

          {mode === "set" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={hasPin ? "New PIN" : "PIN"} htmlFor="pin-new">
                <input
                  id="pin-new"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={newPin}
                  onChange={(e) => setNewPin(digits(e.target.value))}
                  placeholder={`${PIN_LENGTH} digits`}
                  className={`${FIELD_CLASS} bg-surface tracking-[0.3em]`}
                />
              </Field>
              <Field label="Type it again" htmlFor="pin-confirm">
                <input
                  id="pin-confirm"
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(digits(e.target.value))}
                  placeholder={`${PIN_LENGTH} digits`}
                  className={`${FIELD_CLASS} bg-surface tracking-[0.3em]`}
                />
              </Field>
            </div>
          )}

          {mode === "remove" && (
            <p className="text-sm text-ink-600 leading-relaxed">
              Your signatures will still record your name, your role and the moment you signed. What goes is
              the check that it was you at the keyboard. Signatures you have already given keep the record
              that a PIN backed them.
            </p>
          )}

          {error && (
            <p className="text-xs text-danger-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={reset}>
              Cancel
            </Button>
            {mode === "set" ? (
              <Button size="sm" loading={busy} onClick={save}>
                {hasPin ? "Change PIN" : "Set PIN"}
              </Button>
            ) : (
              <Button size="sm" variant="danger" loading={busy} onClick={remove}>
                Turn it off
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
