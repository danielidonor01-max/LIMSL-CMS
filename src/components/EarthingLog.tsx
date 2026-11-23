// src/components/EarthingLog.tsx
// The Earthing module's Log tab: every measurement taken, with its readings,
// as one record to read and to print (LIMSL, 20 Nov 2026).
//
// Earthing is not an equipment category and has no PM on the annual schedule,
// so this log is its maintenance record: what was measured, when, with what,
// by whom, and when each pit is due again.
"use client";

import { useMemo, useState } from "react";
import { History, Printer } from "lucide-react";
import Button from "@/components/Button";
import { Badge } from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import Select from "@/components/Select";
import { ReportHead, ReportSignoff, useReportPage } from "@/components/ReportParts";
import { formatDate } from "@/lib/utils";
import { currentVerdict, dueStatus, latestPerPit, newestFirst, parseReadings } from "@/lib/earthing/earthing";

type LogPit = { id: string; code: string; name: string; location: string | null; limitOhms: number; active: boolean };

type LogTest = {
  id: string;
  testNumber: string;
  pitId: string;
  pitCode: string | null;
  pitName: string | null;
  testDate: string;
  testTime: string | null;
  createdAt: string | null;
  instrumentLabel: string | null;
  instrumentCalStatus: string | null;
  currentProbeDistanceM: number | null;
  readings: string | null;
  resistanceOhms: number;
  spreadPct: number | null;
  consistent: boolean | null;
  limitOhms: number | null;
  verdict: string;
  testedByName: string | null;
};

const CAL_TEXT: Record<string, string> = {
  CURRENT: "In calibration",
  DUE_SOON: "In calibration, due soon",
  OVERDUE: "Calibration overdue",
  NOT_CALIBRATED: "No calibration on record",
  OUT_OF_SERVICE: "Out of service",
};

const DUE_TEXT = { CURRENT: "In date", DUE_SOON: "Due soon", OVERDUE: "Overdue", NEVER: "Never measured" } as const;

const TITLE = "Earth Pit Measurement Log";
const PASS = "bg-brand-500/10 text-brand-700 border-brand-500/20";
const FAIL = "bg-danger-500/10 text-danger-700 border-danger-500/20";
const ohms = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `${Number(n).toFixed(2)} Ω`);

function readingsText(t: LogTest): string {
  const r = parseReadings(t.readings);
  if (r.length <= 1) return "62% only";
  return [52, 62, 72].map((p) => r.find((x) => x.positionPct === p)?.ohms.toFixed(2) ?? "-").join(" / ");
}

export default function EarthingLog({
  pits,
  tests,
  printedBy,
}: {
  pits: LogPit[];
  tests: LogTest[];
  printedBy?: string | null;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [pitId, setPitId] = useState("ALL");

  const shownPits = useMemo(
    () =>
      [...pits]
        .filter((p) => pitId === "ALL" || p.id === pitId)
        .sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code)),
    [pits, pitId],
  );
  const shownTests = useMemo(
    () => newestFirst(tests.filter((t) => pitId === "ALL" || t.pitId === pitId)),
    [tests, pitId],
  );
  const latest = useMemo(() => latestPerPit(tests), [tests]);
  const single = pitId === "ALL" ? null : (pits.find((p) => p.id === pitId) ?? null);
  const period = `${single ? `${single.code}, ${single.name}` : "All earth pits"}. Measurements recorded up to ${formatDate(today)}.`;
  useReportPage(TITLE);

  return (
    <div className="space-y-6 report plain">
      <div className="no-print flex flex-wrap items-center gap-3">
        <Select value={pitId} onChange={setPitId} className="w-full sm:w-64" ariaLabel="Pit to show" searchable={pits.length > 8}>
          <option value="ALL">All pits</option>
          {pits.map((p) => (
            <option key={p.id} value={p.id} data-keywords={[p.name, p.location].filter(Boolean).join(" ")}>
              {p.code} · {p.name}
            </option>
          ))}
        </Select>
        <div className="ml-auto">
          <Button icon={Printer} onClick={() => window.print()} disabled={shownTests.length === 0}>
            Print log
          </Button>
        </div>
      </div>

      <ReportHead title={TITLE} period={period} generatedBy={printedBy} />

      <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden report-flat report-section" aria-labelledby="earth-log-pits">
        <div className="px-6 py-4 border-b border-line">
          <h2 id="earth-log-pits" className="text-base font-semibold text-ink-900">
            Where each pit stands
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            The next measurement is due one year after the last. Integrity is the latest reading against the pit&apos;s limit.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs report-table">
            <thead>
              <tr className="border-b border-ink-200 text-ink-500">
                <th className="py-3 px-5 font-medium">Pit</th>
                <th className="py-3 px-5 font-medium whitespace-nowrap">Next measurement</th>
                <th className="py-3 px-5 font-medium whitespace-nowrap">Last measured</th>
                <th className="py-3 px-5 font-medium text-right">Measurements</th>
                <th className="py-3 px-5 font-medium text-right whitespace-nowrap">Latest reading</th>
                <th className="py-3 px-5 font-medium text-right">Limit</th>
                <th className="py-3 px-5 font-medium">Integrity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-200">
              {shownPits.map((p) => {
                const l = latest.get(p.id) ?? null;
                const due = dueStatus(l?.testDate, today);
                const ok = l ? currentVerdict(l.resistanceOhms, p.limitOhms) === "PASS" : null;
                return (
                  <tr key={p.id}>
                    <td className="py-3 px-5">
                      <div className="font-semibold text-ink-900">{p.code}</div>
                      <div className="text-ink-600">
                        {p.name}
                        {p.location ? `, ${p.location}` : ""}
                      </div>
                    </td>
                    <td className="py-3 px-5 whitespace-nowrap">
                      {p.active ? (
                        <>
                          <div className="font-semibold text-ink-900 tabular-nums">{due.nextDue ? formatDate(due.nextDue) : "Now"}</div>
                          <div className={due.state === "OVERDUE" || due.state === "NEVER" ? "text-danger-700" : "text-ink-600"}>
                            {DUE_TEXT[due.state]}
                          </div>
                        </>
                      ) : (
                        <span className="text-ink-600">Out of use</span>
                      )}
                    </td>
                    <td className="py-3 px-5 tabular-nums text-ink-700 whitespace-nowrap">{l ? formatDate(l.testDate) : "-"}</td>
                    <td className="py-3 px-5 text-right tabular-nums text-ink-700">{tests.filter((t) => t.pitId === p.id).length}</td>
                    <td className="py-3 px-5 text-right tabular-nums font-semibold text-ink-900 whitespace-nowrap">{l ? ohms(l.resistanceOhms) : "-"}</td>
                    <td className="py-3 px-5 text-right tabular-nums text-ink-700 whitespace-nowrap">{p.limitOhms} Ω</td>
                    <td className="py-3 px-5">
                      {ok === null ? (
                        <span className="text-ink-600">Not measured</span>
                      ) : (
                        <Badge className={ok ? PASS : FAIL}>{ok ? "Within limit" : "Above limit"}</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden report-flat report-section" aria-labelledby="earth-log-tests">
        <div className="px-6 py-4 border-b border-line">
          <h2 id="earth-log-tests" className="text-base font-semibold text-ink-900">
            Measurements and readings
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {shownTests.length} measurement{shownTests.length === 1 ? "" : "s"}, newest first. Fall-of-potential method: the
            62% reading is the result, and the 52% and 72% readings check it.
          </p>
        </div>
        {shownTests.length === 0 ? (
          <EmptyState
            icon={History}
            title="No measurements recorded"
            message="Each earth test recorded appears here with its readings, the instrument and who took it."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs report-table">
              <thead>
                <tr className="border-b border-ink-200 text-ink-500">
                  <th className="py-3 px-5 font-medium">Test</th>
                  <th className="py-3 px-5 font-medium">Date</th>
                  <th className="py-3 px-5 font-medium">Pit</th>
                  <th className="py-3 px-5 font-medium whitespace-nowrap">52 / 62 / 72% (Ω)</th>
                  <th className="py-3 px-5 font-medium text-right">Result</th>
                  <th className="py-3 px-5 font-medium text-right">Limit</th>
                  <th className="py-3 px-5 font-medium">Verdict</th>
                  <th className="py-3 px-5 font-medium">Instrument on the day</th>
                  <th className="py-3 px-5 font-medium whitespace-nowrap">Measured by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {shownTests.map((t) => (
                  <tr key={t.id} className="align-top print-avoid-break">
                    <td className="py-3 px-5 font-semibold text-ink-900 whitespace-nowrap">{t.testNumber}</td>
                    <td className="py-3 px-5 tabular-nums text-ink-700 whitespace-nowrap">
                      {formatDate(t.testDate)}
                      {t.testTime ? ` ${t.testTime}` : ""}
                    </td>
                    <td className="py-3 px-5 text-ink-700">
                      <span className="font-medium text-ink-900">{t.pitCode ?? "-"}</span>
                      {t.pitName ? ` ${t.pitName}` : ""}
                    </td>
                    <td className="py-3 px-5 tabular-nums text-ink-700">
                      <div className="whitespace-nowrap">{readingsText(t)}</div>
                      {t.consistent === false && <div className="text-warn-700">Spread {t.spreadPct}%, outside ±5%</div>}
                      {t.consistent === true && <div className="text-ink-600">Spread {t.spreadPct}%</div>}
                      {t.currentProbeDistanceM ? <div className="text-ink-600">D = {t.currentProbeDistanceM} m</div> : null}
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums font-semibold text-ink-900 whitespace-nowrap">{ohms(t.resistanceOhms)}</td>
                    <td className="py-3 px-5 text-right tabular-nums text-ink-700 whitespace-nowrap">
                      {t.limitOhms !== null ? `${t.limitOhms} Ω` : "-"}
                    </td>
                    <td className="py-3 px-5">
                      <Badge className={t.verdict === "PASS" ? PASS : FAIL}>{t.verdict === "PASS" ? "Pass" : "Fail"}</Badge>
                    </td>
                    <td className="py-3 px-5 text-ink-700">
                      <div>{t.instrumentLabel || "-"}</div>
                      {t.instrumentCalStatus && (
                        <div className="text-ink-600">{CAL_TEXT[t.instrumentCalStatus] ?? t.instrumentCalStatus}</div>
                      )}
                    </td>
                    <td className="py-3 px-5 text-ink-700">{t.testedByName || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ReportSignoff />
    </div>
  );
}
