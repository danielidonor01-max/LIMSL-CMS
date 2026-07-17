// src/app/kpi/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  Activity,
  Wrench,
  DollarSign,
  ShieldCheck,
  Gauge,
} from "lucide-react";
import { MONTH_NAMES } from "@/lib/constants";

type Monthly = {
  month: string;
  availability: number | null;
  mtbf: number | null;
  mttr: number | null;
  pmCompliance: number | null;
  inspectionCompliance: number | null;
  maintenanceCost: number | null;
  downtimeCost: number | null;
  productionRevenue: number | null;
  utilizationRate: number | null;
  breakdownFrequency: number | null;
  downtimeHours: number | null;
};

type KpiData = {
  monthly: Monthly[];
  perEquipment: any[];
  live: any;
};

type Tone = "good" | "warning" | "danger" | "neutral";
type Trend = "up" | "down" | "flat";

type Kpi = {
  label: string;
  value: string;
  target: string;
  tone: Tone;
  trend?: Trend;
  trendGood?: "up" | "down"; // which direction is good
};

const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${(n * 100).toFixed(1)}%`;

export default function KpiPage() {
  const [data, setData] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/kpi")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(
    () =>
      (data?.monthly ?? []).map((m) => ({
        name: MONTH_NAMES[parseInt(m.month.slice(5), 10) - 1],
        availability: m.availability ? +(m.availability * 100).toFixed(1) : 0,
        pm: m.pmCompliance ? +(m.pmCompliance * 100).toFixed(1) : 0,
        inspection: m.inspectionCompliance ? +(m.inspectionCompliance * 100).toFixed(1) : 0,
        mtbf: m.mtbf ? +m.mtbf.toFixed(0) : 0,
        mttr: m.mttr ? +m.mttr.toFixed(1) : 0,
        breakdowns: m.breakdownFrequency ?? 0,
        downtime: m.downtimeHours ? +m.downtimeHours.toFixed(1) : 0,
      })),
    [data],
  );

  const categories = useMemo(() => {
    // Guard against an error body (HTTP 200 but no live/monthly) — the fetch
    // doesn't check res.ok, so `data` can be truthy yet malformed.
    if (!data || !data.live || !Array.isArray(data.monthly)) return [];
    const l = data.live;
    const m = data.monthly;
    const trendOf = (key: keyof Monthly): Trend => {
      if (m.length < 2) return "flat";
      const a = (m[m.length - 2][key] as number) ?? 0;
      const b = (m[m.length - 1][key] as number) ?? 0;
      return b > a ? "up" : b < a ? "down" : "flat";
    };
    const lastMo = m[m.length - 1]?.breakdownFrequency ?? 0;
    const downtimeWindow = m.reduce((a, x) => a + (x.downtimeHours ?? 0), 0);

    const reliability: Kpi[] = [
      { label: "MTBF", value: l.mtbf == null ? "—" : `${Math.round(l.mtbf)} hrs`, target: "≥ 200 hrs", tone: (l.mtbf ?? 0) >= 200 ? "good" : "warning", trend: trendOf("mtbf"), trendGood: "up" },
      { label: "Equipment Availability", value: pct(l.availability), target: "≥ 90%", tone: (l.availability ?? 0) >= 0.9 ? "good" : "warning", trend: trendOf("availability"), trendGood: "up" },
      { label: "Breakdown Frequency", value: `${lastMo}/mo`, target: "≤ 2/mo", tone: lastMo <= 2 ? "good" : "warning", trend: trendOf("breakdownFrequency"), trendGood: "down" },
      { label: "Failure Rate", value: `${(l.failureRate ?? 0).toFixed(2)}/asset·mo`, target: "declining", tone: (l.failureRate ?? 0) <= 0.2 ? "good" : "warning" },
      { label: "Active Breakdowns", value: String(l.brokenDown), target: "0", tone: l.brokenDown === 0 ? "good" : "danger" },
    ];
    const maintenance: Kpi[] = [
      { label: "MTTR", value: l.mttr == null ? "—" : `${l.mttr.toFixed(1)} hrs`, target: "≤ 4 hrs", tone: (l.mttr ?? 0) <= 4 ? "good" : "warning", trend: trendOf("mttr"), trendGood: "down" },
      { label: "PM Compliance", value: pct(l.pmCompliance), target: "≥ 95%", tone: (l.pmCompliance ?? 0) >= 0.95 ? "good" : (l.pmCompliance ?? 0) >= 0.5 ? "warning" : "danger", trend: trendOf("pmCompliance"), trendGood: "up" },
      { label: "Inspection Compliance", value: pct(l.inspectionCompliance), target: "≥ 98%", tone: (l.inspectionCompliance ?? 0) >= 0.98 ? "good" : "warning", trend: trendOf("inspectionCompliance"), trendGood: "up" },
      { label: "Maintenance Backlog", value: `${l.maintenanceBacklog ?? 0} MH`, target: "≤ 40 MH", tone: (l.maintenanceBacklog ?? 0) <= 40 ? "good" : "warning" },
      { label: "Open Work Orders", value: String(l.openWos), target: "monitor", tone: "neutral" },
    ];
    const throughput: Kpi[] = [
      { label: "WO Completion Rate", value: pct(l.woCompletionRate), target: "≥ 90%", tone: (l.woCompletionRate ?? 0) >= 0.9 ? "good" : "warning" },
      { label: "Overdue Activities", value: String(l.overdueActivities ?? 0), target: "0", tone: (l.overdueActivities ?? 0) === 0 ? "good" : "warning" },
      { label: "Downtime (6 mo)", value: `${downtimeWindow.toFixed(0)} hrs`, target: "declining", tone: "neutral" },
      { label: "Breakdowns (6 mo)", value: String(l.breakdownsWindow ?? 0), target: "declining", tone: "neutral" },
      { label: "Maint. Cost", value: "Not tracked", target: "—", tone: "neutral" },
    ];
    const safety: Kpi[] = [
      { label: "PTW Compliance", value: pct(l.ptwCompliance), target: "≥ 98%", tone: l.ptwCompliance == null ? "neutral" : l.ptwCompliance >= 0.98 ? "good" : "warning" },
      { label: "Safety Incidents", value: String(l.safetyIncidents ?? 0), target: "0", tone: (l.safetyIncidents ?? 0) === 0 ? "good" : "danger" },
      { label: "Inspection Compliance", value: pct(l.inspectionCompliance), target: "≥ 98%", tone: (l.inspectionCompliance ?? 0) >= 0.98 ? "good" : "warning" },
      { label: "Overdue Activities", value: String(l.overdueActivities ?? 0), target: "0", tone: (l.overdueActivities ?? 0) === 0 ? "good" : "warning" },
    ];
    const assets: Kpi[] = [
      { label: "Total Assets", value: String(l.totalAssets), target: "tracked", tone: "neutral" },
      { label: "Operational", value: String(l.operational ?? 0), target: "max", tone: "good" },
      { label: "Under Maintenance", value: String(l.underMaint ?? 0), target: "monitor", tone: (l.underMaint ?? 0) === 0 ? "good" : "warning" },
      { label: "Broken Down", value: String(l.brokenDown), target: "0", tone: l.brokenDown === 0 ? "good" : "danger" },
    ];

    return [
      { name: "Reliability", icon: Activity, items: reliability },
      { name: "Maintenance", icon: Wrench, items: maintenance },
      { name: "Throughput", icon: Gauge, items: throughput },
      { name: "Safety & Compliance", icon: ShieldCheck, items: safety },
      { name: "Asset Status", icon: DollarSign, items: assets },
    ];
  }, [data]);

  const toneCls: Record<Tone, string> = {
    good: "border-emerald-500/20 bg-emerald-500/5",
    warning: "border-amber-500/20 bg-amber-500/5",
    danger: "border-rose-500/20 bg-rose-500/5",
    neutral: "border-slate-200 bg-slate-50",
  };
  const toneText: Record<Tone, string> = {
    good: "text-emerald-600",
    warning: "text-amber-600",
    danger: "text-rose-600",
    neutral: "text-slate-700",
  };

  const trendIcon = (k: Kpi) => {
    if (!k.trend || k.trend === "flat") return <Minus className="w-3 h-3 text-slate-500" />;
    const isGood = k.trendGood ? k.trend === k.trendGood : k.trend === "up";
    const Icon = k.trend === "up" ? TrendingUp : TrendingDown;
    return <Icon className={`w-3 h-3 ${isGood ? "text-emerald-600" : "text-rose-600"}`} />;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">KPI Dashboard</h2>
            <p className="text-xs text-slate-500 font-mono">
              Computed live from work orders, breakdowns, PM &amp; permits · last 6 months
            </p>
          </div>
        </div>

        {loading || !data ? (
          <div className="py-24 flex justify-center items-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-xs ml-2 font-mono">Loading KPIs…</span>
          </div>
        ) : (
          <>
            {/* KPI category groups */}
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <section key={cat.name} className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Icon className="w-4 h-4 text-emerald-600" /> {cat.name}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {cat.items.map((k) => (
                      <div key={k.label} className={`p-4 rounded-xl border ${toneCls[k.tone]}`}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider leading-tight">
                            {k.label}
                          </span>
                          {trendIcon(k)}
                        </div>
                        <div className={`text-xl font-bold mt-2 ${toneText[k.tone]}`}>{k.value}</div>
                        <p className="text-[10px] text-slate-500 mt-1 font-mono">Target {k.target}</p>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* Trend charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="Equipment Availability & Compliance (%)">
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="av" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="availability" name="Availability" stroke="#059669" fill="url(#av)" strokeWidth={2} />
                    <Line type="monotone" dataKey="pm" name="PM Compliance" stroke="#0284c7" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="inspection" name="Inspection" stroke="#7c3aed" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="MTBF (hrs) vs MTTR (hrs)">
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis yAxisId="l" stroke="#64748b" fontSize={11} />
                    <YAxis yAxisId="r" orientation="right" stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="l" dataKey="mtbf" name="MTBF" fill="#059669" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Line yAxisId="r" type="monotone" dataKey="mttr" name="MTTR" stroke="#e11d48" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Breakdowns & Downtime (hrs)">
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis yAxisId="l" stroke="#64748b" fontSize={11} allowDecimals={false} />
                    <YAxis yAxisId="r" orientation="right" stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="l" dataKey="breakdowns" name="Breakdowns" fill="#e11d48" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Line yAxisId="r" type="monotone" dataKey="downtime" name="Downtime (hrs)" stroke="#d97706" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="PM Compliance (%)">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="pm" name="PM Compliance" fill="#059669" radius={[3, 3, 0, 0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Per-equipment drill-down */}
            {data.perEquipment.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-200">
                  <h3 className="text-sm font-semibold text-slate-900">Per-Equipment Drill-Down (latest)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-5 font-medium">Equipment</th>
                        <th className="py-2.5 px-4 font-medium">Breakdowns</th>
                        <th className="py-2.5 px-4 font-medium">Availability</th>
                        <th className="py-2.5 px-4 font-medium">MTBF</th>
                        <th className="py-2.5 px-4 font-medium">MTTR</th>
                        <th className="py-2.5 px-4 font-medium">Downtime</th>
                        <th className="py-2.5 px-4 font-medium">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.perEquipment.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-5 font-medium text-slate-900">{r.equipmentName}</td>
                          <td className="py-2.5 px-4 text-slate-700">{r.breakdowns}</td>
                          <td className="py-2.5 px-4">{pct(r.availability)}</td>
                          <td className="py-2.5 px-4 text-slate-700">{r.mtbf == null ? "—" : `${r.mtbf} hrs`}</td>
                          <td className="py-2.5 px-4 text-slate-700">{r.mttr == null ? "—" : `${r.mttr} hrs`}</td>
                          <td className="py-2.5 px-4 text-slate-700">{r.downtimeHours} hrs</td>
                          <td className="py-2.5 px-4 text-slate-500">{r.remark}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  fontSize: 12,
  color: "#0f172a",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}
