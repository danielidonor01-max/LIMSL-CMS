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
  title,
  subtitle,
  code,
  backHref,
  backLabel = "Back",
  actions,
}: {
  title: string;
  subtitle?: string;
  code?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
}) {
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
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0 max-w-2xl">
          {/* No truncate. A page title that has to be cut off is a title that
              was too long, and hiding the end of it helps nobody. */}
          <h1 className="text-3xl font-bold tracking-[-0.025em] text-ink-900 leading-tight">
            {title}
          </h1>
          {(subtitle || code) && (
            // ink-600 rather than ink-500: this line sits directly on the
            // canvas, where ink-500 measures 4.32:1 and misses the 4.5:1
            // floor. On a white card ink-500 is still correct.
            <p className="text-sm text-ink-600 mt-2 leading-relaxed">
              {subtitle}
              {code && (
                <span className="text-ink-500">
                  {subtitle ? " " : ""}
                  {code}
                </span>
              )}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
