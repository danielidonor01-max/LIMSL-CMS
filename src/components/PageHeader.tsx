// src/components/PageHeader.tsx
// The standard page title row. UI-STANDARDS has always mandated this component
// but it never existed, so 40 pages hand-rolled their own, two header systems,
// four icon-chip variants and two back-link patterns, with document codes and
// acronyms leaking into subtitles. One header, one chip, one back link.
//
// Subtitles are PLAIN ENGLISH. An internal code (LIMSL-MAIN-015) can ride in
// `code`, where it renders as quiet monospace metadata rather than being the
// only thing describing the page.
"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PageHeader({
  icon: Icon,
  title,
  subtitle,
  code,
  backHref,
  backLabel = "Back",
  actions,
  tone = "emerald",
}: {
  icon?: React.ElementType;
  title: string;
  subtitle?: string;
  code?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  tone?: "emerald" | "rose";
}) {
  const chip = tone === "rose" ? "bg-rose-50 text-rose-600 border-rose-200" : "bg-emerald-50 text-emerald-600 border-emerald-200";

  return (
    <div className="space-y-3">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className={`p-2 rounded-lg border shrink-0 ${chip}`}>
              <Icon className="w-5 h-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 truncate">{title}</h1>
            {(subtitle || code) && (
              <p className="text-xs text-slate-500 mt-0.5">
                {subtitle}
                {subtitle && code ? " · " : ""}
                {code && <span className="font-mono text-slate-400">{code}</span>}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
