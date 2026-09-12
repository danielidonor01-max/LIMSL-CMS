// src/app/verify/page.tsx
// Type the code off a printed sheet and find out whether it still matches.
//
// The answer has three states, not two. "No document carries this code" is
// almost always a typo; "does not match the record" is a finding. Collapsing
// them into "invalid" would lose the only distinction that matters to the
// person holding the paper.
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, Search, Loader2, FileQuestion } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { formatDate } from "@/lib/utils";

type Result = {
  status: "MATCHES" | "ALTERED" | "NOT_FOUND" | "MALFORMED";
  code?: string;
  kind?: string;
  reference?: string | null;
  sealedAt?: string;
  href?: string | null;
  message: string;
};

const TONE: Record<Result["status"], { box: string; icon: typeof ShieldCheck; heading: string }> = {
  MATCHES: {
    box: "border-brand-200 bg-brand-50 text-brand-900",
    icon: ShieldCheck,
    heading: "This document is genuine and unchanged",
  },
  ALTERED: {
    box: "border-danger-300 bg-danger-50 text-danger-900",
    icon: ShieldAlert,
    heading: "This document does not match the record",
  },
  NOT_FOUND: {
    box: "border-warn-200 bg-warn-50 text-warn-900",
    icon: FileQuestion,
    heading: "No document carries this code",
  },
  MALFORMED: {
    box: "border-ink-200 bg-ink-50 text-ink-700",
    icon: FileQuestion,
    heading: "That is not a document code",
  },
};

function VerifyForm() {
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const check = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/verify?code=${encodeURIComponent(code)}`);
      setResult(await res.json());
    } catch {
      setResult({ status: "MALFORMED", message: "Could not reach the system to check that code." });
    } finally {
      setBusy(false);
    }
  };

  const tone = result ? TONE[result.status] : null;
  const Icon = tone?.icon;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-2xl w-full mx-auto space-y-6">
        <PageHeader
          title="Check a document"
          subtitle="Type the code printed on a permit, hazard analysis or method statement to see whether it still matches the record it was signed against"
          backHref="/"
          backLabel="Dashboard"
        />

        <form onSubmit={check} className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-4">
          <div className="space-y-2">
            <label htmlFor="code" className={LABEL_CLASS}>
              Document code
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="LEE-XXXX-XXXX"
              autoComplete="off"
              className={`${FIELD_CLASS} tracking-[0.15em] `}
            />
            <p className="text-xs text-ink-500">
              It is printed at the foot of the sheet. Dashes, spaces and lower case are all fine.
            </p>
          </div>
          <Button type="submit" icon={busy ? undefined : Search} loading={busy}>
            Check this document
          </Button>
        </form>

        {result && tone && Icon && (
          <div className={`rounded-xl border p-6 space-y-3 ${tone.box}`}>
            <div className="flex items-start gap-3">
              <Icon className="w-6 h-6 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-base font-semibold">{tone.heading}</h2>
                <p className="text-sm mt-1 leading-relaxed">{result.message}</p>
              </div>
            </div>

            {result.status !== "NOT_FOUND" && result.status !== "MALFORMED" && (
              <dl className="grid grid-cols-2 gap-3 pt-3 border-t border-current/15 text-xs">
                <div>
                  <dt className="opacity-70">Document</dt>
                  <dd className="font-semibold mt-0.5">{result.kind}</dd>
                </div>
                <div>
                  <dt className="opacity-70">Reference</dt>
                  <dd className="font-semibold mt-0.5">{result.reference ?? "—"}</dd>
                </div>
                <div>
                  <dt className="opacity-70">Signed and sealed</dt>
                  <dd className="font-semibold mt-0.5 tabular-nums">
                    {result.sealedAt ? formatDate(result.sealedAt.slice(0, 10)) : "—"}
                  </dd>
                </div>
                {result.href && (
                  <div>
                    <dt className="opacity-70">Record</dt>
                    <dd className="mt-0.5">
                      <Link href={result.href} className="font-semibold underline">
                        Open it
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        )}

        {/* Said plainly, because an integrity check described as more than it is
            is worse than none at all. */}
        <p className="text-xs text-ink-500 leading-relaxed">
          A match means the printed sheet agrees with the record and its signatures, and that
          neither has changed since it was signed. It is not a cryptographic signature: it does not
          prove the record itself was never altered by someone with access to the database, which is
          what the audit log is for.
        </p>
      </main>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-ink-500">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      }
    >
      <VerifyForm />
    </Suspense>
  );
}
