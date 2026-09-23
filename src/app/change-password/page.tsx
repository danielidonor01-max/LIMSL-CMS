// src/app/change-password/page.tsx
"use client";

import Button from "@/components/Button";
import React, { useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Image from "next/image";
import { AuthGroup, AuthField } from "@/components/AuthField";
import { Loader2, LogOut, ShieldAlert, CheckCircle2, Eye, EyeOff, Check, X, AlertCircle } from "lucide-react";
import { validatePassword, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { label: "Contains a letter", test: (p) => /[A-Za-z]/.test(p) },
  { label: "Contains a number", test: (p) => /[0-9]/.test(p) },
  { label: "Contains a symbol (! ? # $)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Declared at module scope on purpose. A component defined inside another is a
// new type on every render, so React unmounts and remounts its subtree, which is
// how an input loses focus mid-typing.
function Reveal({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="shrink-0 p-1 -mr-1 rounded-lg text-ink-400 hover:text-ink-700"
      aria-label={show ? "Hide passwords" : "Show passwords"}
      tabIndex={-1}
    >
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );
}

export default function ChangePasswordPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mustChange = (session?.user as { mustChangePassword?: boolean })?.mustChangePassword;
  const ruleState = useMemo(() => RULES.map((r) => ({ ...r, ok: r.test(newPassword) })), [newPassword]);
  const matches = confirmPassword.length > 0 && newPassword === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/users/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error || "Failed to change password.");
        toast.error(data.error || "Failed to change password.");
        return;
      }
      toast.success("Password changed successfully.");
      await update({ mustChangePassword: false });
      router.push("/");
      router.refresh();
    } catch (err) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
      toast.error(msg);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">
        {/* The other four auth screens open with the company mark. This one
            opened with a green key in a rounded square, which made the screen a
            technician meets on their very first sign-in the only one that did
            not look like the same product. */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-white border border-ink-200 flex items-center justify-center p-2 shadow-card mb-3">
            <Image src="/brand/logo-80.png" alt="" width={48} height={48} priority className="w-full h-full object-contain" />
          </div>
          <h1 className="font-display text-xl text-ink-900">
            {mustChange ? "Set your password" : "Change your password"}
          </h1>
          {session?.user?.name && (
            <p className="text-sm text-ink-500 mt-1">{session.user.name}</p>
          )}
        </div>

        <div className="space-y-4">
          {mustChange && (
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-warn-50 border border-warn-200 text-warn-900 text-sm">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-warn-600" />
              <div>
                <p className="font-semibold">A new password is required</p>
                <p className="text-sm mt-1 leading-relaxed">
                  You signed in with a temporary password. Choose your own to carry on.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* One panel divided by hairlines, the treatment every other auth
                screen already uses. This page hand-wrote its own field class,
                which is exactly the drift AuthField exists to stop. */}
            <AuthGroup>
              <AuthField
                label="Current password"
                type={show ? "text" : "password"}
                value={currentPassword}
                onChange={setCurrentPassword}
                placeholder={mustChange ? "The temporary one you signed in with" : "Your current password"}
                autoComplete="current-password"
                autoFocus
                required
                trailing={<Reveal show={show} onToggle={() => setShow((v) => !v)} />}
              />
              <AuthField
                label="New password"
                hint={`${PASSWORD_MIN_LENGTH}+ characters`}
                type={show ? "text" : "password"}
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Choose a strong password"
                autoComplete="new-password"
                required
              />
              <AuthField
                label="Confirm new password"
                type={show ? "text" : "password"}
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Type it again"
                autoComplete="new-password"
                required
              />
            </AuthGroup>

            {newPassword.length > 0 && (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {ruleState.map((r) => (
                  <li
                    key={r.label}
                    className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-brand-700" : "text-ink-500"}`}
                  >
                    {r.ok ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <X className="w-3.5 h-3.5 shrink-0 text-ink-400" />
                    )}
                    {r.label}
                  </li>
                ))}
              </ul>
            )}

            {confirmPassword.length > 0 && (
              <p className={`flex items-center gap-1.5 text-xs ${matches ? "text-brand-700" : "text-danger-600"}`}>
                {matches ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                {matches ? "The two match" : "The two do not match"}
              </p>
            )}

            {error && (
              <div
                className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-xs"
                role="alert"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={loading} icon={CheckCircle2}>
              {loading ? "Updating…" : "Update password"}
            </Button>
          </form>

          <div className="flex items-center justify-between pt-1">
            {!mustChange ? (
              <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
                Back to the dashboard
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="ghost"
              size="sm"
              icon={LogOut}
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
