// src/components/PrintableReport.tsx
// Branded, print-optimised compliance report: header (org + title + generated
// stamp), a data table, and an auditor sign-off block. The app chrome is hidden
// on print by globals.css; the toolbar is .no-print. Print to PDF from the browser.
"use client";

import Link from "next/link";
import { ArrowLeft, Printer, Download, Wrench } from "lucide-react";
import { downloadCSV } from "@/lib/export";
import Button from "@/components/Button";

export type Column = { key: string; label: string };

export default function PrintableReport({
  title,
  reference,
  generatedBy,
  generatedAt,
  columns,
  rows,
  csvName,
  summary,
}: {
  title: string;
  reference: string;
  generatedBy: string;
  generatedAt: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  csvName: string;
  summary?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans print:bg-white">
      {/* Toolbar (hidden on print) */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <Link href="/reports" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Reports
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={Download} onClick={() => downloadCSV(csvName, rows, columns.map((c) => c.key))}>
            CSV
          </Button>
          <Button icon={Printer} onClick={() => window.print()}>
            Print / Save PDF
          </Button>
        </div>
      </div>

      <main className="max-w-5xl w-full mx-auto p-6 print:p-0 print:max-w-none">
        <div className="bg-white border border-slate-200 rounded-xl p-8 print:border-0 print:rounded-none print:p-0 space-y-6">
          {/* Letterhead */}
          <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-slate-900 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight text-slate-900 leading-none">
                  LEE INTERNATIONAL
                </h1>
                <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest mt-1">
                  Machinery &amp; Services Limited
                </p>
              </div>
            </div>
            <div className="text-right text-[10px] text-slate-500 font-mono">
              <p className="font-bold text-slate-900">{reference}</p>
              <p>ISO 9001:2015 · ISO 45001</p>
            </div>
          </div>

          {/* Title + generated stamp */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
            <p className="text-[11px] text-slate-500 font-mono mt-1">
              Generated {generatedAt} · by {generatedBy} · {rows.length} record{rows.length === 1 ? "" : "s"}
            </p>
          </div>

          {summary && <div>{summary}</div>}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px] border-collapse">
              <thead>
                <tr className="border-b border-slate-300 text-slate-600">
                  {columns.map((c) => (
                    <th key={c.key} className="py-2 pr-3 font-semibold uppercase tracking-wide">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="py-6 text-center text-slate-400">
                      No records.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="text-slate-800 break-inside-avoid">
                      {columns.map((c) => (
                        <td key={c.key} className="py-1.5 pr-3 align-top">
                          {r[c.key] == null || r[c.key] === "" ? "—" : String(r[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Auditor sign-off block */}
          <div className="grid grid-cols-3 gap-6 pt-10 text-[11px]">
            {["Prepared by", "Reviewed by (QA/QC)", "Approved by"].map((label) => (
              <div key={label}>
                <div className="border-b border-slate-400 h-8" />
                <p className="text-slate-600 mt-1">{label}</p>
                <p className="text-slate-400">Name / Signature / Date</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
