// src/components/WmsDocumentHeader.tsx
// The controlled-document header for a WMS, JHA or Procedure, laid out as the
// LIMSL paper documents are: the identification block (company, document
// series, document title, number, revision, date, page), then the revision
// history, newest stage on top with the column titles along the bottom, then
// the company band.
//
// Everything in it comes from the record. The revision rows and the names under
// Prepared / Reviewed / Approved are the signatures on the sign-off chain (see
// lib/document-control.ts); the Rev. No. and Date Revised in the block are the
// newest of those rows. Nothing here is typed in, so the header cannot say a
// document was approved when it was not.
//
// Drawn with the app's own tokens rather than as a facsimile of the scan: the
// structure is what QA/QC checks a printout against, not the typeface.
"use client";

import Image from "next/image";
import { paperDate, stampDate, type HistoryRow, type Party } from "@/lib/document-control";

export type DocumentHeaderProps = {
  docNumber: string;
  title: string;
  rows: HistoryRow[];
  loading?: boolean;
  /** Series line under the company name. LIMSL prints CORPORATE PROCEDURE on all three. */
  procedureLabel?: string;
  totalPages?: number;
};

const COMPANY = "Lee International Machinery and Services Limited";
const cell = "border-line px-3 py-2";

export function WmsDocumentHeader({
  docNumber,
  title,
  rows,
  loading = false,
  procedureLabel = "Corporate Procedure",
  totalPages = 1,
}: DocumentHeaderProps) {
  const newest = rows[0];
  const revNo = newest ? String(newest.rev) : "-";
  const dateRevised = newest?.date ? paperDate(newest.date).replace(/-/g, ".") : "Not issued";
  const signedNewest = newest ? [newest.prepared, newest.reviewed, newest.approved].map((col) => col.filter((p) => p.signedAt)) : [];
  const hasStamps = signedNewest.some((col) => col.length > 0);

  return (
    <section
      aria-label="Document control"
      className="bg-surface border border-line rounded-xl shadow-card overflow-hidden print:shadow-none print:rounded-none"
    >
      {/* Identification block */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs text-ink-700 min-w-[36rem]">
          <tbody>
            <tr className="border-b border-line">
              <td rowSpan={4} className={`${cell} border-r w-24 align-middle`}>
                <Image src="/brand/logo-80.png" alt="LIMSL" width={64} height={64} className="w-16 h-16 object-contain mx-auto" unoptimized />
              </td>
              <td rowSpan={2} className={`${cell} border-r text-center align-middle`}>
                <p className="text-lg font-bold text-ink-900 uppercase leading-tight">{COMPANY}</p>
              </td>
              <td className={`${cell} whitespace-nowrap`}>
                <span className="font-semibold text-ink-900">Doc. No.:</span> <span className="tabular-nums">{docNumber}</span>
              </td>
            </tr>
            <tr className="border-b border-line">
              <td className={`${cell} whitespace-nowrap`}>
                <span className="font-semibold text-ink-900">Rev. No:</span> <span className="tabular-nums">{loading ? "…" : revNo}</span>
              </td>
            </tr>
            <tr className="border-b border-line">
              <td className={`${cell} border-r text-center font-bold text-ink-900 uppercase tracking-wide`}>{procedureLabel}</td>
              <td className={`${cell} whitespace-nowrap`}>
                <span className="font-semibold text-ink-900">Date Revised:</span>{" "}
                <span className="tabular-nums">{loading ? "…" : dateRevised}</span>
              </td>
            </tr>
            <tr>
              <td className={`${cell} border-r text-center`}>
                <span className="font-semibold text-ink-900">Document:</span> <span className="uppercase">{title}</span>
              </td>
              <td className={`${cell} text-center whitespace-nowrap font-semibold text-ink-900`}>Page 1 of {totalPages}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Revision history */}
      <div className="border-t border-line px-4 pt-5 pb-4 space-y-3">
        <h2 className="text-sm font-bold text-ink-900 uppercase tracking-wide text-center">Revision History</h2>
        <p className="text-base font-bold text-ink-900 uppercase text-center leading-snug">{title}</p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs text-center min-w-[40rem] border border-line">
            <tbody>
              {hasStamps && (
                <tr className="border-b border-line">
                  <td className="border-r border-line" colSpan={3} />
                  {signedNewest.map((col, i) => (
                    <td key={i} className={`border-line px-2 py-2 align-top text-left ${i < 2 ? "border-r" : ""}`}>
                      {col.map((p, j) => (
                        <Stamp key={j} party={p} />
                      ))}
                    </td>
                  ))}
                </tr>
              )}
              {loading ? (
                <tr className="border-b border-line">
                  <td colSpan={6} className="py-4 text-ink-400">Loading signatures…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr className="border-b border-line">
                  <td colSpan={6} className="py-4 px-3 text-ink-500">
                    Not issued yet. The first signature issues it for review and approval.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key} className="border-b border-line align-top">
                    <td className="border-r border-line px-2 py-2.5 tabular-nums text-ink-900">{r.rev}</td>
                    <td className="border-r border-line px-2 py-2.5 tabular-nums whitespace-nowrap">{paperDate(r.date)}</td>
                    <td className="border-r border-line px-2 py-2.5 uppercase text-ink-900">
                      {r.description}
                      {r.note && <span className="block normal-case text-ink-500 mt-1">{r.note}</span>}
                    </td>
                    <PartyCell parties={r.prepared} />
                    <PartyCell parties={r.reviewed} />
                    <PartyCell parties={r.approved} last />
                  </tr>
                ))
              )}
            </tbody>
            {/* Column titles along the bottom, the way the paper block is filled upward. */}
            <tfoot>
              <tr className="bg-canvas font-bold text-ink-900">
                {["Rev", "Date", "Description", "Prepared By", "Reviewed By", "Approved By"].map((h, i) => (
                  <th key={h} scope="col" className={`px-2 py-2 border-line ${i < 5 ? "border-r" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="border-t border-line bg-canvas px-4 py-3">
        <p className="text-base font-bold text-ink-900 text-center uppercase leading-tight">{COMPANY}</p>
      </div>
    </section>
  );
}

function PartyCell({ parties, last = false }: { parties: Party[]; last?: boolean }) {
  return (
    <td className={`border-line px-2 py-2.5 ${last ? "" : "border-r"}`}>
      {parties.length === 0 ? (
        <span className="text-ink-400">-</span>
      ) : (
        <div className="space-y-2">
          {parties.map((p, i) =>
            p.name ? (
              <div key={i}>
                <p className="uppercase text-ink-700">{p.name}</p>
                <p className="uppercase font-bold text-ink-900 leading-tight">
                  {p.title}
                  {p.override && <span className="normal-case font-normal text-warn-700"> (covering)</span>}
                </p>
              </div>
            ) : (
              <div key={i}>
                <p className="text-ink-400">{p.recorded === false ? "Not on record" : "Awaiting"}</p>
                <p className="uppercase font-semibold text-ink-500 leading-tight">{p.title}</p>
              </div>
            ),
          )}
        </div>
      )}
    </td>
  );
}

function Stamp({ party }: { party: Party }) {
  return (
    <div className="flex items-start gap-2 leading-tight [&+&]:mt-2">
      <span className="text-sm font-semibold text-ink-900">{party.name}</span>
      <span className="text-ink-500">
        Digitally signed by {party.name}
        <span className="block tabular-nums">Date: {stampDate(party.signedAt)}</span>
      </span>
    </div>
  );
}

export const CorporateDocumentHeader = WmsDocumentHeader;
export default WmsDocumentHeader;
