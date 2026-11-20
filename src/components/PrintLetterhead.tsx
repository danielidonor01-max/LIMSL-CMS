// src/components/PrintLetterhead.tsx
// The head and foot of a record printed for management (LIMSL, 20 Nov 2026).
//
// The schedule's compliance log and the earthing log both go to management on
// paper, so they carry the company mark, what the record is, the period it
// covers and who produced it when, then a place to sign. Shown only on paper:
// the screen already says all of it in the page around the record.
"use client";

/* eslint-disable @next/next/no-img-element */

const EXACT = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties;

export function PrintLetterhead({
  title,
  period,
  reference,
  generatedBy,
}: {
  title: string;
  period?: string;
  reference?: string;
  generatedBy?: string | null;
}) {
  const now = new Date();
  const stamp = `${now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <div className="print-only mb-5" style={EXACT}>
      <div className="flex items-center justify-between gap-4 border-b-2 border-ink-900 pb-3">
        <div className="flex items-center gap-3">
          {/* A plain img: next/image lazy-loads, and a print dialog opened
              straight away would catch the mark before it had arrived. */}
          <img src="/brand/logo-80.png" alt="" width={52} height={52} className="w-12 h-12 object-contain" />
          <div>
            <p className="font-bold tracking-tight text-ink-900 leading-tight" style={{ fontSize: "13pt" }}>
              LEE INTERNATIONAL MACHINERY AND SERVICES LIMITED
            </p>
            <p className="text-xs text-ink-600 mt-0.5">Maintenance Department</p>
          </div>
        </div>
        {reference && <p className="text-xs font-semibold text-ink-900 whitespace-nowrap">{reference}</p>}
      </div>
      <div className="mt-4">
        <p className="font-bold text-ink-900 leading-tight" style={{ fontSize: "14pt" }}>{title}</p>
        {period && <p className="text-sm text-ink-800 mt-0.5">{period}</p>}
        <p className="text-xs text-ink-600 mt-1">
          Printed {stamp}
          {generatedBy ? ` by ${generatedBy}` : ""}
        </p>
      </div>
    </div>
  );
}

export function PrintSignoff({ labels = ["Prepared by", "Reviewed by", "Approved by"] }: { labels?: string[] }) {
  return (
    <div className="print-only print-avoid-break mt-10">
      <div className="grid grid-cols-3 gap-8 text-xs">
        {labels.map((label) => (
          <div key={label}>
            <div className="border-b border-ink-700 h-10" />
            <p className="text-ink-900 font-semibold mt-1">{label}</p>
            <p className="text-ink-600">Name, signature and date</p>
          </div>
        ))}
      </div>
    </div>
  );
}
