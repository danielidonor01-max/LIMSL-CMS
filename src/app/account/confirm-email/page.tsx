// src/app/account/confirm-email/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function ConfirmEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        </div>
      }
    >
      <Confirm />
    </Suspense>
  );
}

function Confirm() {
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");

  // Confirmed on load. The token came from the recipient's own inbox, so asking
  // them to press another button proves nothing and only adds a step.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    if (!token) {
      setState("error");
      setMessage("This link has no confirmation token.");
      return;
    }
    fetch("/api/account/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) {
          setState("error");
          setMessage(d.error || "Could not confirm this address.");
          return;
        }
        setState("done");
        setMessage(d.email);
      })
      .catch(() => {
        setState("error");
        setMessage("Could not reach the server. Try the link again.");
      });
  }, []);

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center p-2 shadow-sm mx-auto">
          <Image src="/brand/logo-80.png" alt="" width={48} height={48} priority className="w-full h-full object-contain" />
        </div>

        {state === "working" && (
          <>
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600 mx-auto" />
            <p className="text-sm text-slate-600">Confirming your new address...</p>
          </>
        )}

        {state === "done" && (
          <>
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <h1 className="text-lg font-bold text-slate-900">Address confirmed</h1>
            <p className="text-sm text-slate-600">
              Sign in with <span className="font-mono">{message}</span> from now on.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-4 min-h-11 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500"
            >
              Go to sign in
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
            <h1 className="text-lg font-bold text-slate-900">Could not confirm</h1>
            <p className="text-sm text-slate-600">{message}</p>
            <p className="text-xs text-slate-500">
              Your sign-in address has not changed. Request the change again from your account page.
            </p>
            <Link href="/account" className="text-sm text-emerald-700 font-semibold hover:underline">
              Back to your account
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
