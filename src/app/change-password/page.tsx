// src/app/change-password/page.tsx
"use client";

import Button from "@/components/Button";
import React, { useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Loader2, LogOut, ShieldAlert, CheckCircle2, Eye, EyeOff, Check, X } from "lucide-react";
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
      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-ink-400 hover:text-ink-700 hover:bg-ink-100"
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

  const inputClass =
    "w-full px-3.5 py-2.5 pr-11 bg-ink-50 border border-ink-200 rounded-lg text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-all";

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-brand-600 flex items-center justify-center shadow-raised shadow-brand-500/20 mb-3">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <h1 className="font-display text-xl text-ink-900">Change Password</h1>
          <p className="text-xs text-ink-500 mt-0.5">LIMSL CMS Security</p>
        </div>

        <div className="bg-white border border-ink-200 rounded-xl p-6 shadow-card space-y-8">
          {mustChange && (
            <div className="p-3.5 rounded-xl bg-warn-50 border border-warn-200 flex gap-3 text-warn-800">
              <ShieldAlert className="w-5 h-5 shrink-0 text-warn-600 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold">Password update required</span>
                <p className="text-warn-700 mt-0.5 leading-relaxed">
                  You are using a temporary or default password. Please set a new one to continue.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">
                Current Password
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className={inputClass}
                  autoComplete="current-password"
                  required
                />
                <Reveal show={show} onToggle={() => setShow((v) => !v)} />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Choose a strong password"
                  className={inputClass}
                  autoComplete="new-password"
                  required
                />
                <Reveal show={show} onToggle={() => setShow((v) => !v)} />
              </div>
              {newPassword.length > 0 && (
                <ul className="grid grid-cols-2 gap-1.5 mt-2.5">
                  {ruleState.map((r) => (
                    <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-brand-600" : "text-ink-400"}`}>
                      {r.ok ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className={inputClass}
                  autoComplete="new-password"
                  required
                />
                <Reveal show={show} onToggle={() => setShow((v) => !v)} />
              </div>
              {confirmPassword.length > 0 && (
                <p className={`flex items-center gap-1.5 text-xs mt-2 ${matches ? "text-brand-600" : "text-danger-500"}`}>
                  {matches ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {matches ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-600 text-xs">{error}</div>
            )}

            <Button fullWidth
              type="submit"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {loading ? "Updating password…" : "Update password"}
            </Button>
          </form>

          <div className="border-t border-ink-100 pt-4 flex items-center justify-between">
            {!mustChange ? (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-xs font-semibold text-ink-500 hover:text-ink-800 transition-colors"
              >
                Back to Dashboard
              </button>
            ) : (
              <div className="text-xs text-ink-400">
                Logged in as <span className="font-semibold text-ink-600">{session?.user?.name}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500 hover:text-danger-600 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
