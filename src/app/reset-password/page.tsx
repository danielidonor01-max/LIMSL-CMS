// src/app/reset-password/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Loader2, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-reset";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        </div>
      }
    >
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [checking, setChecking] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Check the link before asking for a password twice — an expired link should
  // say so up front, not after the typing.
  useEffect(() => {
    if (!token) {
      setLinkError("No reset token in this link.");
      setChecking(false);
      return;
    }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setLinkError(d?.valid ? null : d?.reason || "This reset link is not valid."))
      .catch(() => setLinkError("Could not check this link. Try again."))
      .finally(() => setChecking(false));
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Could not reset the password.");
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2200);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const field =
    "w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15";

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-2 shadow-sm mb-3">
            <Image src="/brand/logo-80.png" alt="" width={48} height={48} priority className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Choose a new password</h1>
        </div>

        {checking ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          </div>
        ) : done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Password changed</p>
                <p className="text-xs mt-1">Taking you to sign in…</p>
              </div>
            </div>
          </div>
        ) : linkError ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{linkError}</p>
            </div>
            <Link
              href="/forgot-password"
              className="w-full inline-flex items-center justify-center gap-2 px-4 min-h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold"
            >
              Request a new link
            </Link>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="rp-pass" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                New password
              </label>
              <div className="relative">
                <input
                  id="rp-pass"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  required
                  className={`${field} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  aria-label={show ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                At least {MIN_PASSWORD_LENGTH} characters. Avoid your email address or anything guessable.
              </p>
            </div>

            <div>
              <label htmlFor="rp-confirm" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Confirm new password
              </label>
              <input
                id="rp-confirm"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                className={field}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 min-h-11 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-sm font-semibold shadow-sm"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
