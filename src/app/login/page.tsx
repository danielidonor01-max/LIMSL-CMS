// src/app/login/page.tsx
"use client";

import Button from "@/components/Button";
import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { AuthGroup, AuthField } from "@/components/AuthField";
import {
  Loader2, LogIn, Eye, EyeOff, Check, AlertCircle,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawCallback = params.get("callbackUrl") || "/";
  // Only same-app paths, an absolute URL here would be an open redirect.
  const callbackUrl = rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { email: email.trim(), password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid email or password. Check your details and try again.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-2 font-sans">
      {/* Brand / value panel, desktop only */}
      <div className="hidden lg:flex flex-col justify-between text-white p-12 relative overflow-hidden bg-[linear-gradient(150deg,#022c22_0%,#064e3b_45%,#0f3d3e_100%)]">
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-white flex items-center justify-center p-1.5 shadow-card">
            <Image src="/brand/logo-80.png" alt="" width={44} height={44} priority className="w-full h-full object-contain" />
          </div>
          <p className="text-base font-bold leading-none">LIMSL CMS</p>
        </div>

        <div className="relative space-y-8 max-w-lg">
          <h2 className="font-display text-display text-balance">
            Nobody touches a machine until the paperwork says they can.
          </h2>
          <p className="text-white/70 text-sm leading-relaxed max-w-md">
            The maintenance system for LEE International Machinery. Every job carries the chain that
            authorised it, and every step of that chain is signed.
          </p>

          {/* The product's characteristic object: the order the four documents
              have to be approved in before work may start. Structure, not
              records, so there is nothing here to mistake for live data. */}
          <ol className="space-y-px rounded-xl overflow-hidden border border-white/10 bg-white/[0.04] max-w-sm">
            {[
              { step: "Work order", note: "Management authorises the job" },
              { step: "Method statement", note: "How it will be done" },
              { step: "Hazard analysis", note: "What can go wrong, and the controls" },
              { step: "Permit to work", note: "Valid for seven days, renewed daily" },
            ].map(({ step, note }, i) => (
              <li key={step} className="flex items-center gap-3 px-4 py-3 bg-white/[0.03]">
                <span className="w-5 h-5 rounded-full bg-white/10 grid place-items-center shrink-0">
                  <Check className="w-3 h-3 text-brand-300" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{step}</span>
                  <span className="block text-xs text-white/60 leading-tight mt-0.5">{note}</span>
                </span>
                {i < 3 && <span className="ml-auto text-white/60 text-xs shrink-0" aria-hidden="true">then</span>}
              </li>
            ))}
          </ol>
        </div>

        <p className="relative text-xs text-white/60">
          © {new Date().getFullYear()} LEE International Machinery and Services Limited · ISO 9001:2015 · ISO 45001
        </p>
      </div>

      {/* Sign-in form */}
      <div className="flex items-center justify-center p-6 sm:p-10 min-h-screen lg:min-h-0">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="flex flex-col items-center mb-8 lg:hidden">
            <div className="w-12 h-12 rounded-xl bg-white border border-ink-200 flex items-center justify-center p-2 shadow-card mb-3">
              <Image src="/brand/logo-80.png" alt="" width={48} height={48} priority className="w-full h-full object-contain" />
            </div>
            <h1 className="font-display text-xl text-ink-900">LIMSL CMS</h1>
            <p className="text-xs text-ink-500">Maintenance Portal</p>
          </div>

          <div className="mb-6 hidden lg:block">
            <h1 className="font-display text-3xl text-ink-900">Every sign-off starts here.</h1>
            <p className="text-sm text-ink-600 mt-1.5">Sign in to pick up the work waiting on you.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {/* One panel divided by hairlines, not two bordered boxes with a
                gap. A sign-in form is a single thing to fill in, and reading
                as one object is the whole of the difference. */}
            <AuthGroup>
              <AuthField
                label="Email"
                type="email"
                inputMode="email"
                value={email}
                onChange={setEmail}
                placeholder="you@leemachinery.net"
                autoComplete="username"
                autoFocus
                required
              />
              <AuthField
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="shrink-0 p-1 -mr-1 rounded-lg text-ink-400 hover:text-ink-700"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                }
              />
            </AuthGroup>

            <div className="flex justify-end">
              <Link href="/forgot-password" className="text-xs font-semibold text-brand-700 hover:underline">
                Forgot password?
              </Link>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-danger-50 border border-danger-200 text-danger-700 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={loading} icon={LogIn}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <p className="text-xs text-ink-400 text-center mt-6">
            Forgot your password? Ask your Super Admin to reset it from the Users panel.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-canvas flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
