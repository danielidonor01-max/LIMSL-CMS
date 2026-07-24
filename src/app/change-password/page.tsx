// src/app/change-password/page.tsx
"use client";

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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  const inputClass =
    "w-full px-3.5 py-2.5 pr-11 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 transition-all";

  const Reveal = () => (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
      aria-label={show ? "Hide passwords" : "Show passwords"}
      tabIndex={-1}
    >
      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-3">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Change Password</h1>
          <p className="text-xs text-slate-500 font-mono uppercase tracking-wider mt-0.5">LIMSL CMS Security</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
          {mustChange && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex gap-3 text-amber-800">
              <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold">Password update required</span>
                <p className="text-amber-700 mt-0.5 leading-relaxed">
                  You are using a temporary or default password. Please set a new one to continue.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
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
                <Reveal />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
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
                <Reveal />
              </div>
              {newPassword.length > 0 && (
                <ul className="grid grid-cols-2 gap-1.5 mt-2.5">
                  {ruleState.map((r) => (
                    <li key={r.label} className={`flex items-center gap-1.5 text-[11px] ${r.ok ? "text-emerald-600" : "text-slate-400"}`}>
                      {r.ok ? <Check className="w-3 h-3 shrink-0" /> : <X className="w-3 h-3 shrink-0" />}
                      {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
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
                <Reveal />
              </div>
              {confirmPassword.length > 0 && (
                <p className={`flex items-center gap-1.5 text-[11px] mt-2 ${matches ? "text-emerald-600" : "text-rose-500"}`}>
                  {matches ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  {matches ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-600 text-xs">{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-all shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {loading ? "Updating password…" : "Update password"}
            </button>
          </form>

          <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
            {!mustChange ? (
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Back to Dashboard
              </button>
            ) : (
              <div className="text-[11px] text-slate-400">
                Logged in as <span className="font-semibold text-slate-600">{session?.user?.name}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors"
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
