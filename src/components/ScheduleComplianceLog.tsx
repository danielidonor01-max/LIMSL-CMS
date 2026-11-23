// src/components/ScheduleComplianceLog.tsx
// The schedule's Log tab: the PM compliance record for one quarter, to read on
// screen and to print for management review (LIMSL, 20 Nov 2026).
//
// It answers three questions in the order a reviewer asks them: how did the
// quarter go, which categories pulled it down, and which machines exactly.
// The bars are plain blocks rather than a chart library's canvas, because this
// page is printed and a block prints exactly as it is drawn.
"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, CheckCircle2, Clock, Printer, ShieldCheck, XCircle } from "lucide-react";
import Button from "@/components/Button";
import { Badge } from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import MetricPanel from "@/components/MetricPanel";
import SegmentedControl from "@/components/SegmentedControl";
import Select from "@/components/Select";
import { useReportPage } from "@/components/ReportParts";
import { formatDate } from "@/lib/utils";
import {
  COMPLIANCE_TARGET_PCT,
  LOG_OUTCOME_LABELS,
  buildQuarterLog,
  logHeadline,
  logYears,
  quarterLabel,
  quarterOf,
  quarterStanding,
  sumTallies,
  type QuarterLog,
  type LogActivity,
  type LogOutcome,
  type LogTally,
} from "@/lib/maintenance/compliance-log";
import { DEFAULT_COMPLIANCE_RULE, describeRule, type ComplianceRule } from "@/lib/maintenance/compliance-rule";

const EXACT = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as React.CSSProperties;

// One colour per outcome, the same in the bars, the key and the badges.
const SEGMENTS: { key: keyof LogTally; outcome: LogOutcome; bar: string }[] = [
  { key: "onTime", outcome: "ON_TIME", bar: "bg-brand-500" },
  { key: "late", outcome: "LATE", bar: "bg-warn-400" },
  { key: "outsideWindow", outcome: "OUTSIDE_WINDOW", bar: "bg-danger-300" },
  { key: "outstanding", outcome: "OUTSTANDING", bar: "bg-danger-500" },
  { key: "deferred", outcome: "DEFERRED", bar: "bg-info-500" },
  { key: "open", outcome: "OPEN", bar: "bg-warn-200" },
  { key: "notDue", outcome: "NOT_DUE", bar: "bg-ink-200" },
];

const OUTCOME_BADGE: Record<LogOutcome, string> = {
  ON_TIME: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  LATE: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  OUTSIDE_WINDOW: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  OUTSTANDING: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  DEFERRED: "bg-info-500/10 text-info-700 border-info-500/20",
  OPEN: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  NOT_DUE: "bg-ink-500/10 text-ink-600 border-ink-500/20",
};

const pct = (n: number | null) => (n === null ? "-" : `${n}%`);

function StackedBar({ tally }: { tally: LogTally }) {
  if (tally.planned === 0) return null;
  return (
    <div
      className="flex h-2.5 w-full min-w-24 overflow-hidden rounded-full bg-ink-100"
      role="img"
      aria-label={SEGMENTS.filter((s) => (tally[s.key] as number) > 0)
        .map((s) => `${tally[s.key]} ${LOG_OUTCOME_LABELS[s.outcome].toLowerCase()}`)
        .join(", ")}
    >
      {SEGMENTS.map((s) => {
        const n = tally[s.key] as number;
        return n > 0 ? (
          <span key={s.key} className={`${s.bar} border-r border-surface last:border-r-0`} style={{ ...EXACT, width: `${(n / tally.planned) * 100}%` }} />
        ) : null;
      })}
    </div>
  );
}

export default function ScheduleComplianceLog({
  rows,
  categoryLabels,
  printedBy,
  rule = DEFAULT_COMPLIANCE_RULE,
}: {
  rows: LogActivity[];
  categoryLabels: Record<string, string>;
  printedBy?: string | null;
  /** The counting rule set in Settings. */
  rule?: ComplianceRule;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const years = useMemo(() => {
    const y = logYears(rows);
    return y.length ? y : [Number(today.slice(0, 4))];
  }, [rows, today]);

  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [quarter, setQuarter] = useState(() => quarterOf(today));
  const [activityType, setActivityType] = useState<"PM" | "INS">("PM");

  const shownYear = years.includes(year) ? year : years[0];
  const log = useMemo(
    () => buildQuarterLog(rows, { year: shownYear, quarter, activityType, today, rule }),
    [rows, shownYear, quarter, activityType, today, rule],
  );

  const noun = activityType === "PM" ? "PMs" : "inspections";
  // The printed record covers the year, whichever quarter is on screen.
  const year4 = useMemo(
    () => [1, 2, 3, 4].map((q) => buildQuarterLog(rows, { year: shownYear, quarter: q, activityType, today, rule })),
    [rows, shownYear, activityType, today, rule],
  );
  const t = log.total;
  const label = (code: string) => (code === "UNCATEGORISED" ? "No category" : (categoryLabels[code] ?? code));
  const byCategory = [...log.byCategory].sort((a, b) => label(a.category).localeCompare(label(b.category)));
  const notDone = t.outstanding + t.outsideWindow + t.deferred;
  const quarterOpen = t.notDue > 0;

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Select value={String(shownYear)} onChange={(v) => setYear(Number(v))} ariaLabel="Year" className="w-28">
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>
        <SegmentedControl
          ariaLabel="Quarter"
          value={String(quarter) as "1" | "2" | "3" | "4"}
          onChange={(v) => setQuarter(Number(v))}
          options={[
            { value: "1", label: "Q1" },
            { value: "2", label: "Q2" },
            { value: "3", label: "Q3" },
            { value: "4", label: "Q4" },
          ]}
        />
        <SegmentedControl
          ariaLabel="Kind of work"
          value={activityType}
          onChange={setActivityType}
          options={[
            { value: "PM", label: "Preventive maintenance" },
            { value: "INS", label: "Inspections" },
          ]}
        />
        <div className="ml-auto">
          <Button
            icon={Printer}
            onClick={() => window.print()}
            disabled={year4.every((q) => q.total.planned === 0)}
            title="Prints all four quarters of the year and the year's trend, without the machine list"
          >
            Print {shownYear} record
          </Button>
        </div>
      </div>

      <YearPrint
        logs={year4}
        year={shownYear}
        today={today}
        noun={noun}
        kind={activityType === "PM" ? "Preventive Maintenance" : "Inspection"}
        label={label}
        rule={rule}
        printedBy={printedBy}
      />

      <div className="screen-only space-y-6">
      {t.planned === 0 ? (
        <div className="bg-surface border border-line rounded-xl shadow-card">
          <EmptyState
            icon={CalendarCheck}
            title={`Nothing planned for Q${quarter} ${shownYear}`}
            message={`The annual schedule holds no ${noun} in this quarter. Choose another quarter or year.`}
          />
        </div>
      ) : (
        <>
          <section className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-4 print-avoid-break" aria-labelledby="log-summary">
            <div>
              <p className="text-xs text-ink-500 screen-only">{quarterLabel(shownYear, quarter)}</p>
              <h2 id="log-summary" className="text-base font-semibold text-ink-900 mt-0.5">
                {logHeadline(log, noun)}
              </h2>
              <p className="text-sm text-ink-600 mt-1 max-w-3xl">
                {t.compliancePct === null
                  ? "Compliance is measured once work falls due."
                  : t.compliancePct >= COMPLIANCE_TARGET_PCT
                    ? `That meets the ${COMPLIANCE_TARGET_PCT}% target.`
                    : `That is below the ${COMPLIANCE_TARGET_PCT}% target: ${notDone} ${notDone === 1 ? "activity was" : "activities were"} not done in time.`}{" "}
                {t.open > 0
                  ? `${t.open} ${t.open === 1 ? "is" : "are"} due with the window still open, and not yet counted. `
                  : ""}
                {quarterOpen
                  ? `The quarter is still open, and ${t.notDue} planned ${t.notDue === 1 ? "activity is" : "activities are"} not yet due.`
                  : ""}
              </p>
            </div>

            <div className="screen-only">
              <MetricPanel
                label={`Q${quarter} ${shownYear} compliance`}
                metrics={[
                  {
                    key: "compliance",
                    label: "Compliance",
                    value: pct(t.compliancePct),
                    target: `${COMPLIANCE_TARGET_PCT}%`,
                    status:
                      t.compliancePct === null || t.compliancePct >= COMPLIANCE_TARGET_PCT
                        ? "plain"
                        : t.compliancePct >= 50
                          ? "warning"
                          : "danger",
                    icon: ShieldCheck,
                    description: "Done in time, of those due",
                  },
                  {
                    key: "due",
                    label: "Due",
                    count: t.due,
                    value: String(t.due),
                    status: "plain",
                    icon: Clock,
                    description: t.open > 0 ? `Of ${t.planned} planned; ${t.open} due, window open` : `Of ${t.planned} planned in the quarter`,
                  },
                  {
                    key: "done",
                    label: "Done in time",
                    count: t.compliant,
                    value: String(t.compliant),
                    status: "plain",
                    icon: CheckCircle2,
                    description: t.late > 0 ? `${t.late} late, inside the window` : "On or before the planned date",
                  },
                  {
                    key: "notdone",
                    label: "Not done in time",
                    count: notDone,
                    value: String(notDone),
                    status: "danger",
                    icon: XCircle,
                    description: t.deferred > 0 ? `${t.deferred} deferred` : "Overdue, or done too late",
                  },
                ]}
              />
            </div>

          </section>

          <section className="bg-surface border border-line rounded-xl shadow-card p-6 print-avoid-break" aria-labelledby="log-year">
            <h2 id="log-year" className="text-base font-semibold text-ink-900">
              {shownYear} by quarter
            </h2>
            <p className="text-xs text-ink-500 mt-0.5">
              Compliance of each quarter against the {COMPLIANCE_TARGET_PCT}% target, marked by the dashed line.
            </p>
            <div className="mt-5 grid grid-cols-4 gap-4 sm:gap-8 max-w-2xl">
              {log.quarters.map(({ quarter: q, tally }) => {
                const selected = q === quarter;
                const value = tally.compliancePct;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuarter(q)}
                    aria-pressed={selected}
                    aria-label={`Quarter ${q}: ${value === null ? "nothing due yet" : `${value}% compliance, ${tally.compliant} of ${tally.due} done in time`}`}
                    className="group text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-lg"
                  >
                    <div className="text-sm font-semibold tabular-nums text-ink-900">{pct(value)}</div>
                    <div className="relative h-32 mt-1.5 flex items-end justify-center border-b border-ink-300">
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-ink-500"
                        style={{ bottom: `${COMPLIANCE_TARGET_PCT}%` }}
                        aria-hidden
                      />
                      <div
                        className={`w-full max-w-16 rounded-t-lg ${
                          value === null
                            ? "bg-ink-100"
                            : value >= COMPLIANCE_TARGET_PCT
                              ? "bg-brand-500"
                              : value >= 50
                                ? "bg-warn-400"
                                : "bg-danger-500"
                        } ${selected ? "" : "opacity-45 group-hover:opacity-70"}`}
                        style={{ ...EXACT, height: `${Math.max(value ?? 0, 2)}%` }}
                      />
                    </div>
                    <div className={`mt-1.5 text-xs ${selected ? "font-semibold text-ink-900" : "text-ink-600"}`}>Q{q}</div>
                    <div className="text-xs text-ink-500 tabular-nums">
                      {tally.due ? `${tally.compliant} of ${tally.due}` : tally.planned ? "Not yet due" : "None planned"}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden" aria-labelledby="log-categories">
            <div className="px-6 py-4 border-b border-line">
              <h2 id="log-categories" className="text-base font-semibold text-ink-900">
                By equipment category
              </h2>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-ink-600">
                {SEGMENTS.filter((s) => (t[s.key] as number) > 0).map((s) => (
                  <li key={s.key} className="inline-flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${s.bar}`} style={EXACT} aria-hidden />
                    {LOG_OUTCOME_LABELS[s.outcome]}
                  </li>
                ))}
              </ul>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-3 px-5 font-medium">Category</th>
                    <th className="py-3 px-5 font-medium w-1/4 screen-only">Spread</th>
                    <th className="py-3 px-5 font-medium text-right">Planned</th>
                    <th className="py-3 px-5 font-medium text-right">Due</th>
                    <th className="py-3 px-5 font-medium text-right">On time</th>
                    <th className="py-3 px-5 font-medium text-right">Late, in window</th>
                    <th className="py-3 px-5 font-medium text-right">Not done in time</th>
                    <th className="py-3 px-5 font-medium text-right">Compliance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {byCategory.map(({ category, tally }) => {
                    const missed = tally.outstanding + tally.outsideWindow + tally.deferred;
                    return (
                      <tr key={category}>
                        <td className="py-3 px-5 font-medium text-ink-900">{label(category)}</td>
                        <td className="py-3 px-5 screen-only">
                          <StackedBar tally={tally} />
                        </td>
                        <td className="py-3 px-5 text-right tabular-nums text-ink-700">{tally.planned}</td>
                        <td className="py-3 px-5 text-right tabular-nums text-ink-700">{tally.due}</td>
                        <td className="py-3 px-5 text-right tabular-nums text-ink-700">{tally.onTime}</td>
                        <td className="py-3 px-5 text-right tabular-nums text-ink-700">{tally.late}</td>
                        <td className={`py-3 px-5 text-right tabular-nums ${missed > 0 ? "text-danger-700 font-semibold" : "text-ink-700"}`}>
                          {missed}
                        </td>
                        <td className="py-3 px-5 text-right tabular-nums font-semibold text-ink-900">{pct(tally.compliancePct)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-ink-50 font-semibold text-ink-900">
                    <td className="py-3 px-5">All categories</td>
                    <td className="py-3 px-5 screen-only">
                      <StackedBar tally={t} />
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums">{t.planned}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{t.due}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{t.onTime}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{t.late}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{notDone}</td>
                    <td className="py-3 px-5 text-right tabular-nums">{pct(t.compliancePct)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden" aria-labelledby="log-activities">
            <div className="px-6 py-4 border-b border-line">
              <h2 id="log-activities" className="text-base font-semibold text-ink-900">
                Every planned activity in the quarter
              </h2>
              <p className="text-xs text-ink-500 mt-0.5">
                {log.entries.length} {log.entries.length === 1 ? "activity" : "activities"}, in date order.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-3 px-5 font-medium whitespace-nowrap">Planned</th>
                    <th className="py-3 px-5 font-medium">Machine</th>
                    <th className="py-3 px-5 font-medium">Category</th>
                    <th className="py-3 px-5 font-medium whitespace-nowrap">Done on</th>
                    <th className="py-3 px-5 font-medium">Result</th>
                    <th className="py-3 px-5 font-medium whitespace-nowrap">Work order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {log.entries.map((e) => (
                    <tr key={e.id} className="print-avoid-break">
                      <td className="py-2.5 px-5 tabular-nums text-ink-700 whitespace-nowrap">{formatDate(e.plannedDate)}</td>
                      <td className="py-2.5 px-5 font-medium text-ink-900">{e.equipmentName ?? e.assetId ?? "-"}</td>
                      <td className="py-2.5 px-5 text-ink-700">{label(e.category ?? "UNCATEGORISED")}</td>
                      <td className="py-2.5 px-5 tabular-nums text-ink-700 whitespace-nowrap">
                        {e.completedDate ? formatDate(e.completedDate.slice(0, 10)) : "-"}
                        {e.recordedDate && e.recordedDate.slice(0, 10) !== e.completedDate?.slice(0, 10) && (
                          <div className="text-ink-500">recorded {formatDate(e.recordedDate.slice(0, 10))}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-5">
                        <Badge className={OUTCOME_BADGE[e.outcome]}>{LOG_OUTCOME_LABELS[e.outcome]}</Badge>
                        {e.daysLate !== null && e.daysLate > 0 && (
                          <span className="ml-2 text-ink-600 tabular-nums whitespace-nowrap">
                            {e.daysLate} day{e.daysLate === 1 ? "" : "s"} late
                          </span>
                        )}
                        {e.outcome === "DEFERRED" && e.deferredReviewDate && (
                          <span className="ml-2 text-ink-600 whitespace-nowrap">review {formatDate(e.deferredReviewDate)}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-5 tabular-nums text-ink-700 whitespace-nowrap">{e.workOrderNumber ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-xs text-ink-600 max-w-3xl">
            {describeRule(rule)} Deferred work counts against the quarter. Work not yet due is left out until its
            date arrives. The rule is set by the Super Admin in Settings.
          </p>
        </>
      )}
      </div>
    </div>
  );
}

// ── The printed record ──────────────────────────────────────────────────────
// A document, not a screenshot: a cover page, then each quarter with its
// categories, then one page comparing the quarters, under a running header and
// a numbered footer (the `report` page rules in globals.css). No machine list;
// that stays on screen.

/* eslint-disable @next/next/no-img-element */

const STANDING_TEXT = { CLOSED: "Closed", CURRENT: "Current quarter, in progress", AHEAD: "Not started" } as const;
const DOC_NUMBER = "LIMSL-MAIN-PLN-013";

function YearPrint({
  logs,
  year,
  today,
  noun,
  kind,
  label,
  rule,
  printedBy,
}: {
  logs: QuarterLog[];
  year: number;
  today: string;
  noun: string;
  kind: string;
  label: (code: string) => string;
  rule: ComplianceRule;
  printedBy?: string | null;
}) {
  useReportPage(`${kind} Compliance Record ${year}`, DOC_NUMBER);
  const ytd = sumTallies(logs.map((l) => l.total));
  const current = logs.find((l) => quarterStanding(year, l.quarter, today) === "CURRENT") ?? null;
  const missedOf = (x: LogTally) => x.outstanding + x.outsideWindow + x.deferred;
  const asAt = new Date(`${today}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const verdict = (v: number | null) => (v === null ? "Nothing counted yet" : v >= COMPLIANCE_TARGET_PCT ? "Target met" : "Below target");

  // The trend, drawn by hand so it prints exactly as drawn.
  const W = 560;
  const H = 210;
  const base = 170;
  const top = 20;
  const y = (v: number) => base - ((base - top) * v) / 100;
  const x = (i: number) => 70 + i * 125;
  const points = logs
    .map((l, i) => (l.total.compliancePct === null ? null : `${x(i)},${y(l.total.compliancePct)}`))
    .filter(Boolean)
    .join(" ");

  return (
    <div className="print-only report">
      {/* ── Cover ── */}
      <section className="report-cover">
        <div className="report-cover-head">
          <img src="/brand/logo-80.png" alt="" width={64} height={64} />
          <div>
            <p className="report-org">LEE INTERNATIONAL MACHINERY AND SERVICES LIMITED</p>
            <p className="report-dept">Maintenance Department</p>
          </div>
        </div>

        <div className="report-cover-title">
          <p className="report-kicker">Management review record</p>
          <h1>{kind} Compliance Record</h1>
          <p className="report-year">{year}</p>
          <p className="report-asat">All four quarters, as at {asAt}</p>
        </div>

        <div className="report-cover-figures">
          <div>
            <p className="report-figure">{pct(ytd.compliancePct)}</p>
            <p className="report-figure-label">Year to date</p>
            <p className="report-figure-note">
              {ytd.compliant} of {ytd.due} counted, target {COMPLIANCE_TARGET_PCT}%
            </p>
          </div>
          {logs.map((l) => (
            <div key={l.quarter}>
              <p className="report-figure">{pct(l.total.compliancePct)}</p>
              <p className="report-figure-label">Q{l.quarter}</p>
              <p className="report-figure-note">{STANDING_TEXT[quarterStanding(year, l.quarter, today)]}</p>
            </div>
          ))}
        </div>

        <table className="report-control">
          <tbody>
            <tr>
              <th>Document number</th>
              <td>{DOC_NUMBER}</td>
              <th>Period covered</th>
              <td>1 January to 31 December {year}</td>
            </tr>
            <tr>
              <th>Position as at</th>
              <td>{asAt}</td>
              <th>Prepared by</th>
              <td>{printedBy || "Maintenance Department"}</td>
            </tr>
            <tr>
              <th>Source</th>
              <td>LIMSL CMS, annual maintenance schedule</td>
              <th>Contents</th>
              <td>Quarters 1 to 4, year at a glance, sign-off</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ── The quarters ── */}
      <h2 className="report-part">1. Quarter by quarter</h2>
      {logs.map((log) => {
        const t = log.total;
        const standing = quarterStanding(year, log.quarter, today);
        const cats = [...log.byCategory].sort((a, b) => label(a.category).localeCompare(label(b.category)));
        return (
          <section key={log.quarter} className="report-section">
            <div className="report-section-head">
              <h3>{quarterLabel(year, log.quarter)}</h3>
              <p>{STANDING_TEXT[standing]}</p>
            </div>
            {t.planned === 0 ? (
              <p className="report-lead">No {noun} were planned in this quarter.</p>
            ) : (
              <>
                <div className="report-strip">
                  <div>
                    <p className="report-strip-value">{pct(t.compliancePct)}</p>
                    <p className="report-strip-label">Compliance, {verdict(t.compliancePct).toLowerCase()}</p>
                  </div>
                  <div>
                    <p className="report-strip-value">{t.compliant}</p>
                    <p className="report-strip-label">Done in time, of {t.due} counted</p>
                  </div>
                  <div>
                    <p className="report-strip-value">{missedOf(t)}</p>
                    <p className="report-strip-label">Not done in time</p>
                  </div>
                  <div>
                    <p className="report-strip-value">{t.open + t.notDue}</p>
                    <p className="report-strip-label">
                      {t.open > 0 ? `Open: ${t.open} due, ${t.notDue} still to come` : "Still to come"}
                    </p>
                  </div>
                </div>
                <table className="report-table categories">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th className="num">Planned</th>
                      <th className="num">Counted</th>
                      <th className="num">Done in time</th>
                      <th className="num">Not done in time</th>
                      <th className="num">Due, window open</th>
                      <th className="num">Still to come</th>
                      <th className="num">Compliance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cats.map(({ category, tally }) => (
                      <tr key={category}>
                        <td>{label(category)}</td>
                        <td className="num">{tally.planned}</td>
                        <td className="num">{tally.due}</td>
                        <td className="num">{tally.compliant}</td>
                        <td className="num">{missedOf(tally)}</td>
                        <td className="num">{tally.open}</td>
                        <td className="num">{tally.notDue}</td>
                        <td className="num strong">{pct(tally.compliancePct)}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>Quarter total</td>
                      <td className="num">{t.planned}</td>
                      <td className="num">{t.due}</td>
                      <td className="num">{t.compliant}</td>
                      <td className="num">{missedOf(t)}</td>
                      <td className="num">{t.open}</td>
                      <td className="num">{t.notDue}</td>
                      <td className="num">{pct(t.compliancePct)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </section>
        );
      })}

      {/* ── The year ── */}
      <section style={{ breakBefore: "page" }}>
        <h2 className="report-part">2. {year} at a glance</h2>
        <p className="report-lead">
          {ytd.due > 0
            ? `Year to date, ${ytd.compliant} of ${ytd.due} ${noun} counted were done in time: ${ytd.compliancePct}% against a target of ${COMPLIANCE_TARGET_PCT}%.`
            : `No ${noun} have been counted yet this year.`}
          {current
            ? ` The current quarter, Q${current.quarter}, stands at ${pct(current.total.compliancePct)} (${current.total.compliant} of ${current.total.due} counted)${current.total.open > 0 ? `, with ${current.total.open} due and the window still open` : ""}, and ${current.total.notDue} scheduled ${noun} still to come before it closes.`
            : ""}
        </p>

        <div className="report-chart">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Compliance by quarter">
            {[0, 50, 100].map((v) => (
              <g key={v}>
                <line x1="34" x2={W - 10} y1={y(v)} y2={y(v)} stroke="#c9cbc6" strokeWidth="0.75" />
                <text x="28" y={y(v) + 3.5} fontSize="10" textAnchor="end" fill="#3b3f3a">
                  {v}%
                </text>
              </g>
            ))}
            <line x1="34" x2={W - 10} y1={y(COMPLIANCE_TARGET_PCT)} y2={y(COMPLIANCE_TARGET_PCT)} stroke="#111410" strokeWidth="1" strokeDasharray="5 4" />
            <text x={W - 10} y={y(COMPLIANCE_TARGET_PCT) + 13} fontSize="10" textAnchor="end" fill="#111410">
              Target {COMPLIANCE_TARGET_PCT}%
            </text>
            {points.includes(" ") && <polyline points={points} fill="none" stroke="#111410" strokeWidth="1.5" />}
            {logs.map((l, i) => {
              const v = l.total.compliancePct;
              const isCurrent = current?.quarter === l.quarter;
              return (
                <g key={l.quarter}>
                  {v !== null && (
                    <rect
                      x={x(i) - 26}
                      y={y(v)}
                      width="52"
                      height={Math.max(base - y(v), 1)}
                      fill={isCurrent ? "#ffffff" : v >= COMPLIANCE_TARGET_PCT ? "#10b981" : "#9ca39b"}
                      stroke={isCurrent ? "#111410" : "none"}
                      strokeWidth="1.25"
                      strokeDasharray={isCurrent ? "4 3" : undefined}
                    />
                  )}
                  <text
                    x={x(i)}
                    y={v === null ? base - 6 : y(v) - 9}
                    fontSize="11"
                    fontWeight="700"
                    textAnchor="middle"
                    fill="#111410"
                    stroke="#ffffff"
                    strokeWidth="4"
                    paintOrder="stroke"
                  >
                    {v === null ? "-" : `${v}%`}
                  </text>
                  <text x={x(i)} y={base + 15} fontSize="11" fontWeight="700" textAnchor="middle" fill="#111410">
                    Q{l.quarter}
                  </text>
                  <text x={x(i)} y={base + 29} fontSize="9.5" textAnchor="middle" fill="#3b3f3a">
                    {isCurrent ? "in progress" : l.total.due ? `${l.total.compliant} of ${l.total.due}` : l.total.planned ? "not started" : "none planned"}
                  </text>
                </g>
              );
            })}
            {logs.map((l, i) =>
              l.total.compliancePct === null ? null : (
                <circle key={l.quarter} cx={x(i)} cy={y(l.total.compliancePct)} r="3.5" fill="#111410" />
              ),
            )}
          </svg>
          <p className="report-caption">
            Compliance by quarter. Green bars met the target, grey bars did not, and the dashed bar is the quarter in progress.
          </p>
        </div>

        <table className="report-table compare">
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Standing</th>
              <th className="num">Planned</th>
              <th className="num">Counted</th>
              <th className="num">Done in time</th>
              <th className="num">Not done in time</th>
              <th className="num">Due, window open</th>
              <th className="num">Still to come</th>
              <th className="num">Compliance</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.quarter}>
                <td>Q{l.quarter}</td>
                <td>{STANDING_TEXT[quarterStanding(year, l.quarter, today)]}</td>
                <td className="num">{l.total.planned}</td>
                <td className="num">{l.total.due}</td>
                <td className="num">{l.total.compliant}</td>
                <td className="num">{missedOf(l.total)}</td>
                <td className="num">{l.total.open}</td>
                <td className="num">{l.total.notDue}</td>
                <td className="num strong">{pct(l.total.compliancePct)}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={2}>Year to date</td>
              <td className="num">{ytd.planned}</td>
              <td className="num">{ytd.due}</td>
              <td className="num">{ytd.compliant}</td>
              <td className="num">{missedOf(ytd)}</td>
              <td className="num">{ytd.open}</td>
              <td className="num">{ytd.notDue}</td>
              <td className="num">{pct(ytd.compliancePct)}</td>
            </tr>
          </tbody>
        </table>

        <div className="report-note">
          <p className="report-note-title">How this is counted</p>
          <p>
            {describeRule(rule)} Deferred work counts against its quarter. Work still to come is not counted until its
            date arrives. The machine-by-machine list is held in the system under Schedule, Log.
          </p>
        </div>

        <h2 className="report-part report-signoff-title">3. Sign-off</h2>
        <div className="report-signoff">
          {["Prepared by (Maintenance)", "Reviewed by", "Approved by (Management)"].map((who) => (
            <div key={who}>
              <div className="report-sign-line" />
              <p className="report-sign-who">{who}</p>
              <p className="report-sign-what">Name</p>
              <p className="report-sign-what">Signature and date</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
