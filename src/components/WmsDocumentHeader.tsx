// src/components/WmsDocumentHeader.tsx
// Reusable corporate document header matching the LIMSL paper WMS format.
//
// The paper header is a branded block that identifies the company, the document
// series, its revision and page, and a revision history table showing who
// prepared, reviewed and approved each revision. This component reproduces that
// layout in the Giov warm-neutral palette, so a screen view and a printout are
// recognisably the same document.
//
// Usage:
//   <WmsDocumentHeader
//     docNumber="LIMSL-MAIN-WMS-003"
//     title="Work Method Statement for Preventive Maintenance for Konecranes, OMIS Cranes and Lifting Equipment"
//     revisions={[{ rev: 0, date: "05-02-26", ... }, { rev: 1, date: "05-02-26", ... }]}
//   />
"use client";

import Image from "next/image";

export type RevisionEntry = {
  rev: number;
  date: string;
  description: string;
  preparedBy: { name: string; title: string };
  reviewedBy: { name: string; title: string };
  approvedBy: { name: string; title: string };
};

export type WmsDocumentHeaderProps = {
  /** Document number, e.g. LIMSL-MAIN-WMS-003 */
  docNumber: string;
  /** Full document title */
  title: string;
  /** Current revision number */
  revNo: number;
  /** Date last revised, ISO or display format */
  dateRevised: string;
  /** Total pages (display "Page 1 of N") */
  totalPages?: number;
  /** Revision history entries, newest first */
  revisions: RevisionEntry[];
  /** Optional subtitle line below the document procedure tag */
  procedureLabel?: string;
};

export default function WmsDocumentHeader({
  docNumber,
  title,
  revNo,
  dateRevised,
  totalPages = 1,
  revisions,
  procedureLabel = "CORPORATE PROCEDURE",
}: WmsDocumentHeaderProps) {
  return (
    <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden print:shadow-none print:rounded-none print:border-0">
      {/* ─── Top header row: logo + company + doc metadata ─────────────── */}
      <div className="border-b border-ink-200">
        <div className="flex">
          {/* Logo cell */}
          <div className="flex items-center justify-center px-4 py-3 border-r border-ink-200 bg-ink-50/50 shrink-0">
            <Image
              src="/brand/logo-80.png"
              alt="LIMSL"
              width={56}
              height={56}
              className="w-14 h-14 object-contain"
              unoptimized
            />
          </div>

          {/* Company name + procedure label + document title */}
          <div className="flex-1 flex flex-col justify-center min-w-0">
            <div className="px-4 py-2 border-b border-ink-200">
              <h1 className="text-sm font-black text-ink-900 tracking-tight leading-tight uppercase">
                Lee International Machinery and Services Limited
              </h1>
              <p className="text-[10px] text-ink-500 font-semibold uppercase tracking-widest mt-0.5">
                {procedureLabel}
              </p>
            </div>
            <div className="px-4 py-1.5">
              <p className="text-[10px] text-ink-500 leading-snug">
                <span className="font-semibold text-ink-700">Document:</span>{" "}
                <span className="uppercase">{title}</span>
              </p>
            </div>
          </div>

          {/* Document metadata column */}
          <div className="shrink-0 border-l border-ink-200 text-right min-w-[160px]">
            <div className="px-3 py-1.5 border-b border-ink-200">
              <p className="text-[10px] text-ink-500">
                <span className="font-semibold text-ink-700">Doc. No.:</span>{" "}
                <span className="font-mono tabular-nums">{docNumber}</span>
              </p>
            </div>
            <div className="px-3 py-1 border-b border-ink-200 flex justify-between gap-4">
              <p className="text-[10px] text-ink-500">
                <span className="font-semibold text-ink-700">Rev. No:</span>
              </p>
              <p className="text-[10px] font-mono tabular-nums text-ink-700">{revNo}</p>
            </div>
            <div className="px-3 py-1 border-b border-ink-200">
              <p className="text-[10px] text-ink-500">
                <span className="font-semibold text-ink-700">Date Revised:</span>
                <span className="font-mono tabular-nums ml-1">{dateRevised}</span>
              </p>
            </div>
            <div className="px-3 py-1">
              <p className="text-[10px] text-ink-500">
                <span className="font-semibold text-ink-700">Page 1 of {totalPages}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Revision History ─────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-xs font-black text-ink-900 uppercase tracking-wider text-center mb-3">
          Revision History
        </h2>
      </div>

      <div className="px-4 pb-4">
        <h3 className="text-base font-black text-ink-900 uppercase text-center leading-snug tracking-tight mb-4">
          {title}
        </h3>

        {/* Revision history table */}
        <div className="border border-ink-300 rounded-lg overflow-hidden">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="bg-ink-100 border-b border-ink-300">
                <th className="py-2 px-2 text-center font-bold text-ink-700 border-r border-ink-300 w-12">Rev</th>
                <th className="py-2 px-2 text-center font-bold text-ink-700 border-r border-ink-300 w-20">Date</th>
                <th className="py-2 px-2 text-center font-bold text-ink-700 border-r border-ink-300">Description</th>
                <th className="py-2 px-2 text-center font-bold text-ink-700 border-r border-ink-300">Prepared By</th>
                <th className="py-2 px-2 text-center font-bold text-ink-700 border-r border-ink-300">Reviewed By</th>
                <th className="py-2 px-2 text-center font-bold text-ink-700">Approved by</th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((entry, i) => (
                <tr
                  key={entry.rev}
                  className={`border-b border-ink-200 last:border-b-0 ${
                    i % 2 === 0 ? "bg-surface" : "bg-ink-50/30"
                  }`}
                >
                  <td className="py-2 px-2 text-center text-ink-700 tabular-nums border-r border-ink-200">
                    {entry.rev}
                  </td>
                  <td className="py-2 px-2 text-center text-ink-700 tabular-nums border-r border-ink-200 whitespace-nowrap">
                    {entry.date}
                  </td>
                  <td className="py-2 px-2 text-center text-ink-600 border-r border-ink-200 uppercase leading-tight">
                    {entry.description}
                  </td>
                  <td className="py-2 px-2 text-center border-r border-ink-200">
                    <p className="text-ink-700">{entry.preparedBy.name}</p>
                    <p className="font-bold text-ink-900 uppercase leading-tight">{entry.preparedBy.title}</p>
                  </td>
                  <td className="py-2 px-2 text-center border-r border-ink-200">
                    <p className="text-ink-700">{entry.reviewedBy.name}</p>
                    <p className="font-bold text-ink-900 uppercase leading-tight">{entry.reviewedBy.title}</p>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <p className="text-ink-700">{entry.approvedBy.name}</p>
                    <p className="font-bold text-ink-900 uppercase leading-tight">{entry.approvedBy.title}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Company footer strip ─────────────────────────────────────── */}
      <div className="border-t border-ink-300 bg-ink-800 px-4 py-3">
        <p className="text-sm font-black text-white text-center uppercase tracking-wide leading-tight">
          Lee International Machinery and Services Limited
        </p>
      </div>
    </div>
  );
}
