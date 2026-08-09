// src/app/forgot-password/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, Mail, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || "Could not send the reset link.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-2 shadow-sm mb-3">
            <Image src="/brand/logo-80.png" alt="" width={48} height={48} priority className="w-full h-full object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Reset your password</h1>
        </div>

        {sent ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Check your email</p>
                <p className="text-xs mt-1 leading-relaxed">
                  If that address belongs to an account, a reset link is on its way. It expires in an hour and can
                  only be used once.
                </p>
              </div>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Nothing arrived? Check the spam folder. If your address is on a company domain, the message may be
              held in your mail administrator&apos;s quarantine.
            </p>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-emerald-700 font-semibold hover:underline">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              Enter the email address you sign in with and we&apos;ll send you a link to choose a new password.
            </p>
            <div>
              <label htmlFor="fp-email" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                id="fp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@leemachinery.net"
                autoComplete="username"
                autoFocus
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
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
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {loading ? "Sending…" : "Send reset link"}
            </button>

            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
