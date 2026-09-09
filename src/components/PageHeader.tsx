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
  const chip = tone === "rose" ? "bg-danger-50 text-danger-600 border-danger-200" : "bg-brand-50 text-brand-600 border-brand-200";

  return (
    <div className="space-y-3">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-900 transition-colors"
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
            {/* Page titles carry more weight than the rest of the app, which is
                what makes a screen feel like a place rather than a panel. */}
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-ink-900 truncate">{title}</h1>
            {(subtitle || code) && (
              // ink-600 rather than ink-500: this line sits directly on the
              // canvas, where ink-500 measures 4.32:1 and misses the 4.5:1
              // floor. On a white card ink-500 is still correct.
              <p className="text-xs text-ink-600 mt-1">
                {subtitle}
                {subtitle && code ? " · " : ""}
                {code && <span className="font-mono text-ink-500">{code}</span>}
              </p>
            )}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
