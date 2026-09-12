// src/app/reset-password/page.tsx
"use client";

import Button from "@/components/Button";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AuthGroup, AuthField } from "@/components/AuthField";
import { Loader2, KeyRound, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password-reset";

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center">
          <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
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

  // Check the link before asking for a password twice, an expired link should
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

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-white border border-ink-200 flex items-center justify-center p-2 shadow-card mb-3">
            <Image src="/brand/logo-80.png" alt="" width={48} height={48} priority className="w-full h-full object-contain" />
          </div>
          <h1 className="font-display text-xl text-ink-900">Choose a new password</h1>
        </div>

        {checking ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
          </div>
        ) : done ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-brand-50 border border-brand-200 text-brand-900 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Password changed</p>
                <p className="text-xs mt-1">Taking you to sign in…</p>
              </div>
            </div>
          </div>
        ) : linkError ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 px-3 py-3 rounded-lg bg-danger-50 border border-danger-200 text-danger-800 text-sm" role="alert">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>{linkError}</p>
            </div>
            <Button fullWidth
              href="/forgot-password"
            >
              Request a new link
            </Button>
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
              <ArrowLeft className="w-4 h-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <AuthGroup>
              <AuthField
                label="New password"
                hint={`${MIN_PASSWORD_LENGTH}+ characters`}
                type={show ? "text" : "password"}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                autoFocus
                required
                trailing={
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="shrink-0 p-1 -mr-1 rounded-lg text-ink-400 hover:text-ink-700"
                    aria-label={show ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
              <AuthField
                label="Confirm new password"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                required
              />
            </AuthGroup>

            <p className="text-xs text-ink-500">
              Avoid your email address or anything guessable.
            </p>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-xs" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <Button fullWidth
              type="submit"
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {loading ? "Saving…" : "Set new password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
