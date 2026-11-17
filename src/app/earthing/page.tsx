// src/app/earthing/page.tsx
// The site's earthing, monitored pit by pit (LIMSL, 17 Nov 2026).
//
// Earthing used to be one row in the equipment register, "Earthing system",
// which could say it had been serviced and nothing about whether it worked.
// What matters is the resistance of each earth pit, measured by the
// fall-of-potential method with the Habotest HT20302, and how that figure moves
// year to year. So the page leads with how many pits are inside their limit,
// shows the instrument and whether it was in calibration, and keeps every test
// with its trend.
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ClipboardPlus,
  ExternalLink,
  History,
  Pencil,
  Plus,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PAGE_MAIN, PAGE_ROOT } from "@/lib/page-shell";
import { invalidateApi, useApi } from "@/lib/api-cache";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { formatDate } from "@/lib/utils";
import PageHeader from "@/components/PageHeader";
import PageLead from "@/components/PageLead";
import Button from "@/components/Button";
import Tabs from "@/components/Tabs";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import DateField from "@/components/DateField";
import TimeField from "@/components/TimeField";
import Toggle from "@/components/Toggle";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import KebabMenu, { type KebabItem } from "@/components/KebabMenu";
import { Badge } from "@/components/Badge";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import {
  DEFAULT_LIMIT_OHMS,
  ELECTRODE_LABELS,
  ELECTRODE_TYPES,
  SOIL_CONDITIONS,
  SOIL_LABELS,
  calibrationWarning,
  changeVsPrevious,
  dueStatus,
  evaluateFallOfPotential,
  latestPerPit,
  parseReadings,
  probePositions,
  seriesForPit,
  slopePerYear,
  type DueState,
} from "@/lib/earthing/earthing";

// ── Types ───────────────────────────────────────────────────────────────────

type Pit = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  description: string | null;
  electrodeType: string | null;
  limitOhms: number;
  active: boolean;
};

type EarthTest = {
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
  soilCondition: string | null;
  weather: string | null;
  remarks: string | null;
  testedByName: string | null;
};

type Instrument = {
  id: string;
  instrumentName: string;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  nextCalibrationDate: string | null;
  label: string;
  earthTester: boolean;
  calStatus: string;
};

type PitsPayload = { pits: Pit[]; setupRequired: boolean };
type TestsPayload = { tests: EarthTest[]; setupRequired: boolean };
type TabKey = "pits" | "history" | "trends";

const TODAY = new Date().toISOString().slice(0, 10);
const ohms = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `${Number(n).toFixed(2)} Ω`);

// ── Badges ──────────────────────────────────────────────────────────────────

const CAL_BADGE: Record<string, { label: string; cls: string }> = {
  CURRENT: { label: "In calibration", cls: "bg-brand-500/10 text-brand-700 border-brand-500/20" },
  DUE_SOON: { label: "Calibration due soon", cls: "bg-warn-500/10 text-warn-700 border-warn-500/20" },
  OVERDUE: { label: "Calibration overdue", cls: "bg-danger-500/10 text-danger-700 border-danger-500/20" },
  NOT_CALIBRATED: { label: "No calibration on record", cls: "bg-danger-500/10 text-danger-700 border-danger-500/20" },
  OUT_OF_SERVICE: { label: "Out of service", cls: "bg-danger-500/10 text-danger-700 border-danger-500/20" },
};

function CalBadge({ status }: { status: string | null | undefined }) {
  const b = CAL_BADGE[status ?? ""] ?? { label: status || "Unknown", cls: "bg-ink-500/10 text-ink-600 border-ink-500/20" };
  return <Badge className={b.cls}>{b.label}</Badge>;
}

function VerdictBadge({ verdict }: { verdict: string }) {
  return verdict === "PASS" ? (
    <Badge className="bg-brand-500/10 text-brand-700 border-brand-500/20">Pass</Badge>
  ) : (
    <Badge className="bg-danger-500/10 text-danger-700 border-danger-500/20">Fail</Badge>
  );
}

const DUE_BADGE: Record<DueState, { label: string; cls: string }> = {
  CURRENT: { label: "In date", cls: "bg-brand-500/10 text-brand-700 border-brand-500/20" },
  DUE_SOON: { label: "Due soon", cls: "bg-warn-500/10 text-warn-700 border-warn-500/20" },
  OVERDUE: { label: "Overdue", cls: "bg-danger-500/10 text-danger-700 border-danger-500/20" },
  NEVER: { label: "Never tested", cls: "bg-ink-500/10 text-ink-600 border-ink-500/20" },
};

function DueBadge({ state }: { state: DueState }) {
  return <Badge className={DUE_BADGE[state].cls}>{DUE_BADGE[state].label}</Badge>;
}

// ── Charts ──────────────────────────────────────────────────────────────────
// Categorical slots in fixed order (the dataviz reference palette, validated
// for colour-vision deficiency on a light surface). A pit keeps its colour by
// its position in the pit list, never by its rank in what is drawn.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const AXIS = "#6f726e";
const GRID = "#dedfdb";
const LIMIT = "#4b4e4a";
const tooltipStyle = { fontSize: 12, borderRadius: 8, border: `1px solid ${GRID}` };
const shortDate = (t: number) => new Date(t).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

function Sparkline({ values, colour }: { values: number[]; colour: string }) {
  if (values.length < 2) return <span className="text-ink-500">-</span>;
  return (
    <LineChart width={72} height={24} data={values.map((v, i) => ({ i, v }))} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
      <YAxis hide domain={["dataMin", "dataMax"]} />
      <Line type="monotone" dataKey="v" stroke={colour} strokeWidth={2} dot={false} isAnimationActive={false} />
    </LineChart>
  );
}

function ChangeHint({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const Icon = pct > 0 ? ArrowUpRight : ArrowDownRight;
  // Rising resistance is the bad direction for an earth, so it is the one
  // marked; a fall is good news and stays quiet.
  return (
    <span className={`inline-flex items-center gap-0.5 tabular-nums ${pct > 0 ? "text-warn-700" : "text-ink-600"}`}>
      <Icon className="w-3.5 h-3.5" />
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

function TrendsPanel({ pits, tests }: { pits: Pit[]; tests: EarthTest[] }) {
  const [pitId, setPitId] = useState<string>("ALL");
  const colourOf = useMemo(() => new Map(pits.map((p, i) => [p.id, SERIES[i % SERIES.length]])), [pits]);
  const withTests = useMemo(() => pits.filter((p) => tests.some((t) => t.pitId === p.id)), [pits, tests]);
  const drawn = withTests.slice(0, SERIES.length);

  const single = pitId !== "ALL" ? pits.find((p) => p.id === pitId) ?? null : null;
  const singleSeries = single ? seriesForPit(tests, single.id) : [];
  const slope = single ? slopePerYear(singleSeries) : null;

  const allData = useMemo(() => {
    const byDate = new Map<number, Record<string, number>>();
    for (const p of drawn) {
      for (const t of seriesForPit(tests, p.id)) {
        const x = Date.parse(`${t.testDate}T00:00:00Z`);
        const row = byDate.get(x) ?? { x };
        row[p.id] = t.resistanceOhms;
        byDate.set(x, row);
      }
    }
    return [...byDate.values()].sort((a, b) => a.x - b.x);
  }, [drawn, tests]);
  const sharedLimit = drawn.length > 0 && drawn.every((p) => p.limitOhms === drawn[0].limitOhms) ? drawn[0].limitOhms : null;

  const enough = single ? singleSeries.length >= 2 : tests.length >= 2;

  return (
    <div className="bg-surface border border-line rounded-xl shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink-900">Resistance over time</h2>
          <p className="text-xs text-ink-500 mt-0.5">
            {single
              ? slope === null
                ? `${single.code} · limit ${single.limitOhms} Ω`
                : `${single.code} · limit ${single.limitOhms} Ω · ${slope > 0 ? "rising" : slope < 0 ? "falling" : "flat"} ${Math.abs(slope).toFixed(2)} Ω a year`
              : withTests.length > drawn.length
                ? `The first ${drawn.length} of ${withTests.length} pits with tests. Choose a pit to see any one of them.`
                : "Every pit with a test. A steady climb shows long before a pit crosses its limit."}
          </p>
        </div>
        <Select value={pitId} onChange={setPitId} className="w-full sm:w-64" ariaLabel="Pit to chart" searchable={pits.length > 8}>
          <option value="ALL">All pits</option>
          {pits.map((p) => (
            <option key={p.id} value={p.id} data-keywords={[p.name, p.location].filter(Boolean).join(" ")}>
              {p.code} · {p.name}
            </option>
          ))}
        </Select>
      </div>
      {!enough ? (
        <EmptyState
          icon={Activity}
          title="Not enough tests for a trend"
          message="A trend needs at least two tests. Each annual test adds a point."
        />
      ) : (
        <div className="px-2 sm:px-4 py-5">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={single ? singleSeries.map((t) => ({ x: Date.parse(`${t.testDate}T00:00:00Z`), ohms: t.resistanceOhms })) : allData}
              margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis
                dataKey="x"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickFormatter={shortDate}
                stroke={AXIS}
                fontSize={12}
              />
              <YAxis stroke={AXIS} fontSize={12} width={44} unit=" Ω" allowDecimals />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(x) => formatDate(new Date(Number(x)).toISOString().slice(0, 10))}
                formatter={(v, name) => [`${Number(v).toFixed(2)} Ω`, String(name)]}
              />
              {single ? (
                <>
                  <ReferenceLine
                    y={single.limitOhms}
                    stroke={LIMIT}
                    strokeDasharray="6 4"
                    label={{ value: `Limit ${single.limitOhms} Ω`, position: "insideTopRight", fill: AXIS, fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="ohms"
                    name={single.code}
                    stroke={colourOf.get(single.id) ?? SERIES[0]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
                    activeDot={{ r: 5 }}
                  />
                </>
              ) : (
                <>
                  {sharedLimit !== null && (
                    <ReferenceLine
                      y={sharedLimit}
                      stroke={LIMIT}
                      strokeDasharray="6 4"
                      label={{ value: `Limit ${sharedLimit} Ω`, position: "insideTopRight", fill: AXIS, fontSize: 12 }}
                    />
                  )}
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {drawn.map((p) => (
                    <Line
                      key={p.id}
                      type="monotone"
                      dataKey={p.id}
                      name={p.code}
                      stroke={colourOf.get(p.id)}
                      strokeWidth={2}
                      connectNulls
                      dot={{ r: 4, strokeWidth: 2, fill: "#ffffff" }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Instrument ──────────────────────────────────────────────────────────────

function InstrumentCard({ instruments, loading }: { instruments: Instrument[]; loading: boolean }) {
  const testers = instruments.filter((i) => i.earthTester);
  const primary = testers.find((i) => /HT20302/i.test(`${i.model} ${i.instrumentName}`)) ?? testers[0] ?? null;

  if (loading) {
    return (
      <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
        <TableSkeleton rows={2} cols={4} />
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="flex items-start gap-3 px-6 py-4 rounded-xl border border-warn-200 bg-warn-50 text-warn-800">
        <AlertTriangle className="w-5 h-5 shrink-0" />
        <div className="text-sm">
          <p className="font-semibold">The Habotest HT20302 is not in the calibration register yet</p>
          <p className="text-xs mt-1">
            Earth tests are traced to the instrument that took them, and that instrument has to be in the calibration
            register.{" "}
            <Link href="/calibration" className="font-semibold underline underline-offset-2">
              Open the calibration register
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const warn = calibrationWarning(primary.calStatus);
  return (
    <section className="bg-surface border border-line rounded-xl shadow-card px-6 py-5" aria-labelledby="earth-instrument">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-ink-500">Measuring instrument</p>
          <h2 id="earth-instrument" className="text-base font-semibold text-ink-900 mt-0.5">
            {primary.instrumentName}
          </h2>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs">
            <div className="flex gap-1.5">
              <dt className="text-ink-500">Make</dt>
              <dd className="text-ink-900 font-medium">{primary.make || "-"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-500">Model</dt>
              <dd className="text-ink-900 font-medium">{primary.model || "-"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-500">S/N</dt>
              <dd className="text-ink-900 font-medium">{primary.serialNumber || "-"}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-ink-500">Method</dt>
              <dd className="text-ink-900 font-medium">Fall of potential (62%)</dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1.5">
          <CalBadge status={primary.calStatus} />
          <p className="text-xs text-ink-600 tabular-nums">
            {primary.nextCalibrationDate ? `Calibration due ${formatDate(primary.nextCalibrationDate)}` : "No calibration due date"}
          </p>
          <Link href="/calibration" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
            Calibration register <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
      {warn && (
        <p className="flex items-start gap-2 mt-4 px-3 py-2 rounded-lg bg-danger-50 text-danger-700 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {warn} Tests recorded now carry that state on their record.
        </p>
      )}
    </section>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

type PitRow = {
  pit: Pit;
  latest: EarthTest | null;
  due: ReturnType<typeof dueStatus>;
  values: number[];
  change: number | null;
  colour: string;
};

function PitsTable({
  rows,
  canWrite,
  onNewTest,
  onEdit,
  onHistory,
}: {
  rows: PitRow[];
  canWrite: boolean;
  onNewTest: (pitId: string) => void;
  onEdit: (pit: Pit) => void;
  onHistory: (pitId: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-ink-200 text-ink-500">
            <th className="py-3 px-5 font-medium">Pit</th>
            <th className="py-3 px-5 font-medium">Location</th>
            <th className="py-3 px-5 font-medium text-right">Limit</th>
            <th className="py-3 px-5 font-medium">Latest reading</th>
            <th className="py-3 px-5 font-medium">Last tested</th>
            <th className="py-3 px-5 font-medium">Next test</th>
            <th className="py-3 px-5 font-medium">Trend</th>
            <th className="py-3 px-5 font-medium w-14">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {rows.map(({ pit, latest, due, values, change, colour }) => {
            const items: KebabItem[] = [
              ...(canWrite && pit.active ? [{ label: "New test for this pit", icon: ClipboardPlus, onClick: () => onNewTest(pit.id) }] : []),
              ...(canWrite ? [{ label: "Edit pit", icon: Pencil, onClick: () => onEdit(pit) }] : []),
              { label: "View history", icon: History, onClick: () => onHistory(pit.id) },
            ];
            return (
              <tr key={pit.id} className={`hover:bg-ink-50 ${pit.active ? "" : "text-ink-500"}`}>
                <td className="py-3 px-5">
                  <div className="font-semibold text-ink-900">{pit.code}</div>
                  <div className="text-ink-600">{pit.name}</div>
                  {!pit.active && <Badge className="mt-1 bg-ink-500/10 text-ink-600 border-ink-500/20">Out of use</Badge>}
                </td>
                <td className="py-3 px-5 text-ink-700">{pit.location || "-"}</td>
                <td className="py-3 px-5 text-right tabular-nums text-ink-700 whitespace-nowrap">{pit.limitOhms} Ω</td>
                <td className="py-3 px-5 whitespace-nowrap">
                  {latest ? (
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums font-semibold text-ink-900">{ohms(latest.resistanceOhms)}</span>
                      <VerdictBadge verdict={latest.verdict} />
                    </div>
                  ) : (
                    <span className="text-ink-500">No test yet</span>
                  )}
                </td>
                <td className="py-3 px-5 tabular-nums text-ink-700 whitespace-nowrap">{latest ? formatDate(latest.testDate) : "-"}</td>
                <td className="py-3 px-5 whitespace-nowrap">
                  {pit.active ? (
                    <div className="flex flex-col items-start gap-1">
                      <DueBadge state={due.state} />
                      {due.nextDue && <span className="text-ink-500 tabular-nums">{formatDate(due.nextDue)}</span>}
                    </div>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="py-3 px-5">
                  <div className="flex items-center gap-2">
                    <Sparkline values={values} colour={colour} />
                    <ChangeHint pct={change} />
                  </div>
                </td>
                <td className="py-3 px-5 text-right">
                  <KebabMenu ariaLabel={`Actions for ${pit.code}`} items={items} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function readingsText(t: EarthTest): string {
  const r = parseReadings(t.readings);
  if (r.length <= 1) return "62% only";
  return [52, 62, 72].map((p) => r.find((x) => x.positionPct === p)?.ohms.toFixed(2) ?? "-").join(" / ");
}

function HistoryTable({ tests }: { tests: EarthTest[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-ink-200 text-ink-500">
            <th className="py-3 px-5 font-medium">Test</th>
            <th className="py-3 px-5 font-medium">Date</th>
            <th className="py-3 px-5 font-medium">Pit</th>
            <th className="py-3 px-5 font-medium text-right">Result</th>
            <th className="py-3 px-5 font-medium">Verdict</th>
            <th className="py-3 px-5 font-medium">52 / 62 / 72% (Ω)</th>
            <th className="py-3 px-5 font-medium">Instrument on the day</th>
            <th className="py-3 px-5 font-medium">Tested by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-200">
          {tests.map((t) => (
            <tr key={t.id} className="hover:bg-ink-50 align-top">
              <td className="py-3 px-5 font-semibold text-ink-900 whitespace-nowrap">{t.testNumber}</td>
              <td className="py-3 px-5 tabular-nums text-ink-700 whitespace-nowrap">
                {formatDate(t.testDate)}
                {t.testTime ? <span className="text-ink-500"> {t.testTime}</span> : null}
              </td>
              <td className="py-3 px-5 text-ink-700">
                <div className="font-medium text-ink-900">{t.pitCode ?? "-"}</div>
                {t.pitName && <div className="text-ink-500">{t.pitName}</div>}
              </td>
              <td className="py-3 px-5 text-right tabular-nums font-semibold text-ink-900 whitespace-nowrap">
                {ohms(t.resistanceOhms)}
                {t.limitOhms !== null && <div className="font-normal text-ink-500">limit {t.limitOhms} Ω</div>}
              </td>
              <td className="py-3 px-5">
                <VerdictBadge verdict={t.verdict} />
              </td>
              <td className="py-3 px-5 tabular-nums text-ink-700 whitespace-nowrap">
                {readingsText(t)}
                {t.consistent === false && (
                  <div className="text-warn-700">Spread {t.spreadPct}%, outside ±5%</div>
                )}
                {t.consistent === true && <div className="text-ink-500">Spread {t.spreadPct}%</div>}
                {t.currentProbeDistanceM ? <div className="text-ink-500">D = {t.currentProbeDistanceM} m</div> : null}
              </td>
              <td className="py-3 px-5 text-ink-700">
                <div>{t.instrumentLabel || "-"}</div>
                {t.instrumentCalStatus && (
                  <div className="mt-1">
                    <CalBadge status={t.instrumentCalStatus} />
                  </div>
                )}
              </td>
              <td className="py-3 px-5 text-ink-700">{t.testedByName || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Forms ───────────────────────────────────────────────────────────────────

type TestForm = {
  pitId: string;
  testDate: string;
  testTime: string;
  instrumentId: string;
  d: string;
  r52: string;
  r62: string;
  r72: string;
  single: boolean;
  soilCondition: string;
  weather: string;
  remarks: string;
};

function TestModal({
  open,
  initialPitId,
  pits,
  instruments,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialPitId: string;
  pits: Pit[];
  instruments: Instrument[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultInstrument = useMemo(() => {
    const testers = instruments.filter((i) => i.earthTester);
    return (testers.find((i) => /HT20302/i.test(`${i.model} ${i.instrumentName}`)) ?? testers[0])?.id ?? "";
  }, [instruments]);

  const blank = (): TestForm => ({
    pitId: initialPitId,
    testDate: TODAY,
    testTime: "",
    instrumentId: defaultInstrument,
    d: "",
    r52: "",
    r62: "",
    r72: "",
    single: false,
    soilCondition: "",
    weather: "",
    remarks: "",
  });

  const [form, setForm] = useState<TestForm>(blank);
  const [saving, setSaving] = useState(false);
  // Reset each time the dialog opens, onto the pit it was opened for.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(blank());
  }

  const set = <K extends keyof TestForm>(k: K, v: TestForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const activePits = pits.filter((p) => p.active);
  const pit = pits.find((p) => p.id === form.pitId) ?? null;
  const instrument = instruments.find((i) => i.id === form.instrumentId) ?? null;
  const calWarn = calibrationWarning(instrument?.calStatus);
  const positions = probePositions(Number(form.d) || null);

  const preview =
    pit && form.r62
      ? evaluateFallOfPotential({
          currentProbeDistanceM: form.d || null,
          r52: form.r52,
          r62: form.r62,
          r72: form.r72,
          singleReading: form.single,
          limitOhms: pit.limitOhms,
        })
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.pitId) return toast.error("Choose the earth pit that was tested.");
    if (!form.instrumentId) return toast.error("Choose the instrument the test was taken with.");
    if (preview && !preview.ok) return toast.error(preview.error);
    if (!preview) return toast.error("Enter the resistance read with the potential probe at 62%.");
    setSaving(true);
    try {
      const res = await fetch("/api/earthing/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pitId: form.pitId,
          testDate: form.testDate,
          testTime: form.testTime || null,
          instrumentId: form.instrumentId,
          currentProbeDistanceM: form.d || null,
          r52: form.single ? null : form.r52,
          r62: form.r62,
          r72: form.single ? null : form.r72,
          singleReading: form.single,
          soilCondition: form.soilCondition || null,
          weather: form.weather,
          remarks: form.remarks,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to record the test.");
      if (json.verdict === "FAIL") {
        toast.error(
          `${json.testNumber}: ${json.pitCode} is above its limit.` +
            (json.nonConformity ? ` Non-conformity ${json.nonConformity.ncNumber} raised.` : ""),
        );
      } else {
        toast.success(`${json.testNumber} recorded: ${json.pitCode} within its limit.`);
      }
      if (json.warning) toast.warning(json.warning);
      if (json.advice) toast.warning(json.advice);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record the test.");
    } finally {
      setSaving(false);
    }
  }

  const testers = instruments.filter((i) => i.earthTester);
  const others = instruments.filter((i) => !i.earthTester);

  return (
    <Modal open={open} onClose={onClose} title="New earth test" subtitle="Fall-of-potential method" maxWidthClass="max-w-2xl">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className={LABEL_CLASS}>Earth pit</label>
          <Select value={form.pitId} onChange={(v) => set("pitId", v)} className="w-full" ariaLabel="Earth pit" searchable>
            <option value="" disabled>
              Select pit…
            </option>
            {activePits.map((p) => (
              <option key={p.id} value={p.id} data-keywords={[p.name, p.location].filter(Boolean).join(" ")}>
                {p.code} · {p.name} (limit {p.limitOhms} Ω)
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Date</label>
            <DateField value={form.testDate} onChange={(v) => set("testDate", v)} max={TODAY} required ariaLabel="Test date" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Time (optional)</label>
            <TimeField value={form.testTime} onChange={(v) => set("testTime", v)} ariaLabel="Test time" />
          </div>
        </div>

        <div>
          <label className={LABEL_CLASS}>Instrument</label>
          <Select value={form.instrumentId} onChange={(v) => set("instrumentId", v)} className="w-full" ariaLabel="Instrument" searchable={instruments.length > 8}>
            <option value="" disabled>
              Select instrument…
            </option>
            {testers.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
            {others.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label} (not an earth tester)
              </option>
            ))}
          </Select>
          {instrument && (
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-ink-600">
              <CalBadge status={instrument.calStatus} />
              {instrument.nextCalibrationDate && <span className="tabular-nums">due {formatDate(instrument.nextCalibrationDate)}</span>}
            </div>
          )}
          {calWarn && (
            <p className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg bg-danger-50 text-danger-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {calWarn}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-line p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div>
              <label className={LABEL_CLASS} htmlFor="earth-d">
                Current spike distance D (m)
              </label>
              <input
                id="earth-d"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={form.d}
                onChange={(e) => set("d", e.target.value)}
                className={FIELD_CLASS}
                placeholder="e.g. 30"
              />
            </div>
            <div className="flex items-center gap-3 sm:justify-end min-h-11">
              <Toggle checked={form.single} onChange={(v) => set("single", v)} ariaLabel="I only took the 62% reading" />
              <span className="text-sm text-ink-700">I only took the 62% reading</span>
            </div>
          </div>

          <div className={`grid gap-3 ${form.single ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3"}`}>
            {positions
              .filter((p) => !form.single || p.positionPct === 62)
              .map((p) => {
                const key = (p.positionPct === 52 ? "r52" : p.positionPct === 62 ? "r62" : "r72") as "r52" | "r62" | "r72";
                return (
                  <div key={p.positionPct}>
                    <label className={LABEL_CLASS} htmlFor={`earth-${key}`}>
                      P at {p.positionPct}%{p.distanceM !== null ? ` (${p.distanceM} m)` : ""}, Ω
                    </label>
                    <input
                      id={`earth-${key}`}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      required={p.positionPct === 62 || !form.single}
                      value={form[key]}
                      onChange={(e) => set(key, e.target.value)}
                      className={FIELD_CLASS}
                    />
                  </div>
                );
              })}
          </div>

          {preview && preview.ok ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-ink-600">
                Result <span className="font-semibold text-ink-900 tabular-nums">{ohms(preview.value.resistanceOhms)}</span>
              </span>
              <VerdictBadge verdict={preview.value.verdict} />
              <span className="text-xs text-ink-600">against {preview.value.limitOhms} Ω</span>
              {preview.value.consistent === true && (
                <span className="text-xs text-ink-600 tabular-nums">Readings agree within ±5% ({preview.value.spreadPct}%)</span>
              )}
              {preview.value.consistent === null && <span className="text-xs text-ink-600">Single reading: consistency not checked</span>}
              {preview.value.advice && (
                <p className="basis-full flex items-start gap-2 px-3 py-2 rounded-lg bg-warn-50 text-warn-800 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Spread {preview.value.spreadPct}%. {preview.value.advice} The test can still be saved.
                </p>
              )}
            </div>
          ) : preview && !preview.ok ? (
            <p className="text-xs text-ink-600">{preview.error}</p>
          ) : (
            <p className="text-xs text-ink-600">
              Drive the current spike out a distance D, take the readings with the potential probe at 52%, 62% and 72% of D.
              The 62% reading is the result.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS}>Soil condition (optional)</label>
            <Select value={form.soilCondition} onChange={(v) => set("soilCondition", v)} className="w-full" ariaLabel="Soil condition">
              <option value="">Not recorded</option>
              {SOIL_CONDITIONS.map((s) => (
                <option key={s} value={s}>
                  {SOIL_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="earth-weather">
              Weather (optional)
            </label>
            <input
              id="earth-weather"
              value={form.weather}
              onChange={(e) => set("weather", e.target.value)}
              className={FIELD_CLASS}
              placeholder="e.g. Dry season, sunny"
            />
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="earth-remarks">
            Remarks (optional)
          </label>
          <textarea
            id="earth-remarks"
            rows={2}
            value={form.remarks}
            onChange={(e) => set("remarks", e.target.value)}
            className={FIELD_CLASS}
            placeholder="Condition of the pit, the clamp and the conductor"
          />
        </div>

        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Save test
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type PitForm = {
  code: string;
  name: string;
  location: string;
  electrodeType: string;
  limitOhms: string;
  description: string;
  active: boolean;
};

function PitModal({
  open,
  pit,
  onClose,
  onSaved,
}: {
  open: boolean;
  pit: Pit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const blank = (): PitForm => ({
    code: pit?.code ?? "",
    name: pit?.name ?? "",
    location: pit?.location ?? "",
    electrodeType: pit?.electrodeType ?? "",
    limitOhms: String(pit?.limitOhms ?? DEFAULT_LIMIT_OHMS),
    description: pit?.description ?? "",
    active: pit?.active ?? true,
  });
  const [form, setForm] = useState<PitForm>(blank);
  const [saving, setSaving] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(blank());
  }
  const set = <K extends keyof PitForm>(k: K, v: PitForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(pit ? `/api/earthing/pits/${pit.id}` : "/api/earthing/pits", {
        method: pit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          location: form.location,
          electrodeType: form.electrodeType || null,
          limitOhms: form.limitOhms,
          description: form.description,
          ...(pit ? { active: form.active } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save the pit.");
      toast.success(pit ? `${json.code ?? form.code} saved.` : `${json.code} added.`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save the pit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={pit ? "Edit earth pit" : "Add earth pit"} subtitle={pit ? pit.code : "One electrode or pit that is tested on its own"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className={LABEL_CLASS}>Pit number</span>
            <p className="px-3 py-2 text-sm rounded-lg bg-ink-100 text-ink-700">
              {pit ? pit.code : "Given when you add it"}
            </p>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="pit-limit">
              Resistance limit (Ω)
            </label>
            <input
              id="pit-limit"
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              required
              value={form.limitOhms}
              onChange={(e) => set("limitOhms", e.target.value)}
              className={FIELD_CLASS}
            />
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="pit-name">
            Name
          </label>
          <input
            id="pit-name"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            className={FIELD_CLASS}
            placeholder="Main distribution board earth"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS} htmlFor="pit-location">
              Location (optional)
            </label>
            <input id="pit-location" value={form.location} onChange={(e) => set("location", e.target.value)} className={FIELD_CLASS} placeholder="Bay 2, north wall" />
          </div>
          <div>
            <label className={LABEL_CLASS}>Electrode type (optional)</label>
            <Select value={form.electrodeType} onChange={(v) => set("electrodeType", v)} className="w-full" ariaLabel="Electrode type">
              <option value="">Not recorded</option>
              {ELECTRODE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ELECTRODE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <label className={LABEL_CLASS} htmlFor="pit-description">
            Description (optional)
          </label>
          <textarea
            id="pit-description"
            rows={2}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            className={FIELD_CLASS}
            placeholder="What it earths, how deep, when it was installed"
          />
        </div>
        <p className="text-xs text-ink-600">
          5 Ω is the usual limit for a general installation earth. A lightning-protection or electronics earth is
          often held to 1 Ω. Changing the limit later does not re-judge earlier tests.
        </p>
        {pit && (
          <div className="flex items-center gap-3">
            <Toggle checked={form.active} onChange={(v) => set("active", v)} ariaLabel="Pit in use" />
            <span className="text-sm text-ink-700">{form.active ? "In use" : "Out of use (kept with its history)"}</span>
          </div>
        )}
        <div className="flex gap-3 justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            {pit ? "Save pit" : "Add pit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function EarthingPage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");

  const pitsApi = useApi<PitsPayload>("/api/earthing/pits", { pits: [], setupRequired: false });
  const testsApi = useApi<TestsPayload>("/api/earthing/tests", { tests: [], setupRequired: false });
  const instApi = useApi<Instrument[]>("/api/earthing/instruments?all=1", []);

  const pits = useMemo(() => pitsApi.data.pits ?? [], [pitsApi.data.pits]);
  const tests = useMemo(() => testsApi.data.tests ?? [], [testsApi.data.tests]);
  const instruments = useMemo(() => (Array.isArray(instApi.data) ? instApi.data : []), [instApi.data]);
  const setupRequired = pitsApi.data.setupRequired || testsApi.data.setupRequired;
  const loading = pitsApi.loading || testsApi.loading;

  const [tab, setTab] = useState<TabKey>("pits");
  const [historyPit, setHistoryPit] = useState("ALL");
  const [testFor, setTestFor] = useState<string | null>(null);
  const [pitEditing, setPitEditing] = useState<Pit | "new" | null>(null);

  const rows: PitRow[] = useMemo(() => {
    const latest = latestPerPit(tests);
    return [...pits]
      .sort((a, b) => Number(b.active) - Number(a.active) || a.code.localeCompare(b.code))
      .map((pit) => {
        const series = seriesForPit(tests, pit.id);
        const l = latest.get(pit.id) ?? null;
        return {
          pit,
          latest: l,
          due: dueStatus(l?.testDate, TODAY),
          values: series.map((t) => t.resistanceOhms),
          change: changeVsPrevious(series),
          colour: SERIES[pits.indexOf(pit) % SERIES.length],
        };
      });
  }, [pits, tests]);

  const summary = useMemo(() => {
    const active = rows.filter((r) => r.pit.active);
    const passing = active.filter((r) => r.latest?.verdict === "PASS").length;
    const failing = active.filter((r) => r.latest?.verdict === "FAIL").length;
    const dueOrOver = active.filter((r) => r.due.state === "OVERDUE" || r.due.state === "DUE_SOON" || r.due.state === "NEVER").length;
    const overdue = active.filter((r) => r.due.state === "OVERDUE" || r.due.state === "NEVER").length;
    const lastTest = tests[0]?.testDate ?? null;
    return { total: active.length, passing, failing, dueOrOver, overdue, lastTest };
  }, [rows, tests]);

  const historyRows = historyPit === "ALL" ? tests : tests.filter((t) => t.pitId === historyPit);

  const refreshAll = () => {
    invalidateApi("/api/earthing");
    pitsApi.refresh();
    testsApi.refresh();
  };

  const openNewTest = (pitId = "") => {
    if (pits.filter((p) => p.active).length === 0) {
      toast.error("Add an earth pit first. Each test is recorded against a pit.");
      return;
    }
    setTestFor(pitId);
  };

  const writable = canWrite && !setupRequired;

  const headline =
    summary.total === 0
      ? "No earth pits are registered yet."
      : `${summary.passing} of ${summary.total} earth pit${summary.total === 1 ? "" : "s"} within limit.`;
  const supporting =
    summary.total === 0
      ? "Register each earth pit with its resistance limit, then record its fall-of-potential test. The trend builds from there."
      : summary.failing > 0
        ? `${summary.failing === 1 ? "One pit reads" : `${summary.failing} pits read`} above the limit at the last test. An earth above its limit is not protecting anybody: improve the electrode and retest.`
        : summary.overdue > 0
          ? `${summary.overdue === 1 ? "One pit has" : `${summary.overdue} pits have`} not been tested in the last year. Earthing is tested annually.`
          : "Every pit read inside its limit at its last test. Earthing is tested annually, and the trend shows a pit drifting long before it fails.";

  return (
    <div className={PAGE_ROOT}>
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Earthing"
          subtitle="The resistance of every earth pit on site, tested by the fall-of-potential method, with its history and trend"
          backHref="/"
          backLabel="Dashboard"
          actions={
            writable ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" icon={Plus} onClick={() => setPitEditing("new")}>
                  Add earth pit
                </Button>
                <Button icon={ClipboardPlus} onClick={() => openNewTest()}>
                  New earth test
                </Button>
              </div>
            ) : undefined
          }
        />

        {setupRequired && (
          <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-warn-200 bg-warn-50 text-warn-800 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
            <span>
              The Earthing module is not switched on for this database yet. An administrator runs{" "}
              <span className="font-semibold">src/lib/db/apply-earthing.ts</span> once (or Database maintenance in
              Settings); until then pits and tests cannot be saved.
            </span>
          </div>
        )}

        {pitsApi.error || testsApi.error ? (
          <div className="bg-surface border border-line rounded-xl shadow-card">
            <EmptyState
              icon={AlertTriangle}
              title="The earthing record could not be loaded"
              message="Check the connection and try again."
              actionLabel="Try again"
              onAction={refreshAll}
            />
          </div>
        ) : loading ? (
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <TableSkeleton rows={5} cols={6} />
          </div>
        ) : (
          <>
            <PageLead
              headingId="earthing-lead"
              headline={headline}
              supporting={supporting}
              figure={{
                label: "Pits within limit",
                value: String(summary.passing),
                unit: `of ${summary.total}`,
                progress: summary.total ? (summary.passing / summary.total) * 100 : 0,
                tone: summary.failing > 0 ? "bad" : summary.dueOrOver > 0 ? "warn" : "good",
              }}
              stats={[
                { label: "above limit", value: summary.failing, tone: "bad" },
                { label: "due or overdue", value: summary.dueOrOver, tone: "warn" },
                { label: "last test", value: summary.lastTest ? formatDate(summary.lastTest) : "None" },
              ]}
            />

            <InstrumentCard instruments={instruments} loading={instApi.loading} />

            <div className="space-y-4">
              <Tabs<TabKey>
                ariaLabel="Earthing views"
                value={tab}
                onChange={setTab}
                items={[
                  { value: "pits", label: "Earth pits", count: pits.length },
                  { value: "history", label: "Test history", count: tests.length },
                  { value: "trends", label: "Trends" },
                ]}
              />

              {tab === "pits" && (
                <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                  {rows.length === 0 ? (
                    <EmptyState
                      icon={Zap}
                      title="No earth pits registered"
                      message="Add each earth pit with its resistance limit. Its tests and trend hang off it."
                      actionLabel={writable ? "Add earth pit" : undefined}
                      onAction={writable ? () => setPitEditing("new") : undefined}
                    />
                  ) : (
                    <PitsTable
                      rows={rows}
                      canWrite={writable}
                      onNewTest={(id) => openNewTest(id)}
                      onEdit={(p) => setPitEditing(p)}
                      onHistory={(id) => {
                        setHistoryPit(id);
                        setTab("history");
                      }}
                    />
                  )}
                </div>
              )}

              {tab === "history" && (
                <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-line">
                    <h2 className="text-base font-semibold text-ink-900">Every test, newest first</h2>
                    <Select value={historyPit} onChange={setHistoryPit} className="w-full sm:w-64" ariaLabel="Filter by pit" searchable={pits.length > 8}>
                      <option value="ALL">All pits</option>
                      {pits.map((p) => (
                        <option key={p.id} value={p.id} data-keywords={[p.name, p.location].filter(Boolean).join(" ")}>
                          {p.code} · {p.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  {historyRows.length === 0 ? (
                    <EmptyState
                      icon={History}
                      title="No tests recorded"
                      message="Each fall-of-potential test you record appears here with the instrument and its calibration state on the day."
                      actionLabel={writable && pits.length > 0 ? "New earth test" : undefined}
                      onAction={writable && pits.length > 0 ? () => openNewTest(historyPit === "ALL" ? "" : historyPit) : undefined}
                    />
                  ) : (
                    <HistoryTable tests={historyRows} />
                  )}
                </div>
              )}

              {tab === "trends" && <TrendsPanel pits={pits} tests={tests} />}
            </div>
          </>
        )}
      </main>

      <TestModal
        open={testFor !== null}
        initialPitId={testFor ?? ""}
        pits={pits}
        instruments={instruments}
        onClose={() => setTestFor(null)}
        onSaved={() => {
          setTestFor(null);
          refreshAll();
        }}
      />
      <PitModal
        open={pitEditing !== null}
        pit={pitEditing && pitEditing !== "new" ? pitEditing : null}
        onClose={() => setPitEditing(null)}
        onSaved={() => {
          setPitEditing(null);
          refreshAll();
        }}
      />
    </div>
  );
}
