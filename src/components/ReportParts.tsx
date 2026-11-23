// src/components/ReportParts.tsx
// The parts every printed management record shares (LIMSL, 20 Nov 2026).
//
// One document style for anything management reads on paper: the company head,
// the record's title and period, a running header and a numbered footer on
// every page, plain tables and a place to sign. The rules are the `report`
// block in globals.css; these are the pieces a screen puts them together from.
//
// A record with a cover page is `className="report"`. One without is
// `className="report plain"`, and starts with <ReportHead />.
"use client";

import { useEffect } from "react";

/* eslint-disable @next/next/no-img-element */

const cssString = (s: string) => `"${s.replace(/["\\\n]/g, " ")}"`;

/**
 * Puts this record's own title in the running header and its reference in the
 * footer. The page-margin rules read them from the document root, which is the
 * only place a printed page's margins can take text from.
 */
export function useReportPage(title: string, reference?: string | null) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--report-title", cssString(title));
    root.style.setProperty(
      "--report-foot",
      cssString(`${reference ? `${reference}  ·  ` : ""}Controlled record, printed from LIMSL CMS`),
    );
    return () => {
      root.style.removeProperty("--report-title");
      root.style.removeProperty("--report-foot");
    };
  }, [title, reference]);
}

/** The head of a record that has no cover page. Shown on paper only. */
export function ReportHead({
  title,
  period,
  reference,
  generatedBy,
  department = "Maintenance Department",
}: {
  title: string;
  period?: string | null;
  reference?: string | null;
  generatedBy?: string | null;
  department?: string;
}) {
  const now = new Date();
  const stamp = `${now.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}, ${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  return (
    <div className="print-only report-head">
      <div className="report-cover-head">
        <img src="/brand/logo-80.png" alt="" width={64} height={64} />
        <div>
          <p className="report-org">LEE INTERNATIONAL MACHINERY AND SERVICES LIMITED</p>
          <p className="report-dept">{department}</p>
        </div>
      </div>
      <div className="report-head-title">
        <h1>{title}</h1>
        {period && <p className="report-head-period">{period}</p>}
        <p className="report-head-meta">
          {reference ? `${reference}  ·  ` : ""}Printed {stamp}
          {generatedBy ? ` by ${generatedBy}` : ""}
        </p>
      </div>
    </div>
  );
}

/** Where the record is signed. Shown on paper only. */
export function ReportSignoff({
  labels = ["Prepared by (Maintenance)", "Reviewed by", "Approved by (Management)"],
  title = "Sign-off",
}: {
  labels?: string[];
  title?: string;
}) {
  return (
    <div className="print-only report-signoff-block">
      <h2 className="report-part report-signoff-title">{title}</h2>
      <div className="report-signoff">
        {labels.map((who) => (
          <div key={who}>
            <div className="report-sign-line" />
            <p className="report-sign-who">{who}</p>
            <p className="report-sign-what">Name</p>
            <p className="report-sign-what">Signature and date</p>
          </div>
        ))}
      </div>
    </div>
  );
}
