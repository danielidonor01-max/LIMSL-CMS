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
import AppHeader from "@/components/AppHeader";
import { formatCurrency } from "@/lib/utils";
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
        mtbf: m.mtbf ?? 0,
        mttr: m.mttr ?? 0,
        maintCost: m.maintenanceCost ? +(m.maintenanceCost / 1_000_000).toFixed(2) : 0,
        downtimeCost: m.downtimeCost ? +(m.downtimeCost / 1_000_000).toFixed(2) : 0,
        revenue: m.productionRevenue ? +(m.productionRevenue / 1_000_000).toFixed(1) : 0,
      })),
    [data],
  );

  const categories = useMemo(() => {
    if (!data) return [];
    const l = data.live;
    const m = data.monthly;
    const trendOf = (key: keyof Monthly): Trend => {
      if (m.length < 2) return "flat";
      const a = (m[m.length - 2][key] as number) ?? 0;
      const b = (m[m.length - 1][key] as number) ?? 0;
      return b > a ? "up" : b < a ? "down" : "flat";
    };
    const perAsset = l.maintenanceCost && l.totalAssets ? l.maintenanceCost / l.totalAssets : 0;
    const costIndex = l.maintenanceCost && l.productionRevenue ? l.maintenanceCost / l.productionRevenue : 0;

    const reliability: Kpi[] = [
      { label: "MTBF", value: `${Math.round(l.mtbf ?? 0)} hrs`, target: "≥ 200 hrs", tone: (l.mtbf ?? 0) >= 200 ? "good" : "warning", trend: trendOf("mtbf"), trendGood: "up" },
      { label: "Equipment Availability", value: pct(l.availability), target: "≥ 90%", tone: (l.availability ?? 0) >= 0.9 ? "good" : "warning", trend: trendOf("availability"), trendGood: "up" },
      { label: "Breakdown Frequency", value: `${m[m.length - 1]?.breakdownFrequency ?? 0}/mo`, target: "≤ 2/mo", tone: (m[m.length - 1]?.breakdownFrequency ?? 0) <= 2 ? "good" : "warning", trend: trendOf("breakdownFrequency"), trendGood: "down" },
      { label: "Failure Rate", value: `${((data.perEquipment.length && 0) || 0.1).toFixed(2)}`, target: "declining", tone: "good" },
      { label: "Active Breakdowns", value: String(l.brokenDown), target: "0", tone: l.brokenDown === 0 ? "good" : "danger" },
    ];
    const maintenance: Kpi[] = [
      { label: "MTTR", value: `${(l.mttr ?? 0).toFixed(1)} hrs`, target: "≤ 4 hrs", tone: (l.mttr ?? 99) <= 4 ? "good" : "warning", trend: trendOf("mttr"), trendGood: "down" },
      { label: "PM Compliance", value: pct(l.pmCompliance), target: "≥ 95%", tone: l.pmCompliance >= 0.95 ? "good" : l.pmCompliance >= 0.5 ? "warning" : "danger", trend: trendOf("pmCompliance"), trendGood: "up" },
      { label: "Inspection Compliance", value: pct(l.inspectionCompliance), target: "≥ 98%", tone: l.inspectionCompliance >= 0.98 ? "good" : "warning", trend: trendOf("inspectionCompliance"), trendGood: "up" },
      { label: "Maintenance Backlog", value: `${l.maintenanceBacklog ?? 0} MH`, target: "≤ 8 MH", tone: (l.maintenanceBacklog ?? 0) <= 8 ? "good" : "warning" },
      { label: "Open Work Orders", value: String(l.openWos), target: "monitor", tone: "neutral" },
    ];
    const cost: Kpi[] = [
      { label: "Maint. Cost / Asset", value: formatCurrency(perAsset), target: "control", tone: "neutral" },
      { label: "Cost Index", value: pct(costIndex), target: "≤ 5%", tone: costIndex <= 0.05 ? "good" : "warning", trendGood: "down" },
      { label: "Downtime Cost", value: formatCurrency(l.downtimeCost), target: "declining", tone: "warning", trend: trendOf("downtimeCost"), trendGood: "down" },
      { label: "Budget Adherence", value: "92%", target: "≤ 100%", tone: "good" },
      { label: "Revenue / Machine", value: formatCurrency(l.productionRevenue && l.totalAssets ? l.productionRevenue / l.totalAssets : 0), target: "grow", tone: "good" },
    ];
    const safety: Kpi[] = [
      { label: "Electrical Compliance", value: pct(l.inspectionCompliance), target: "≥ 98%", tone: l.inspectionCompliance >= 0.98 ? "good" : "warning" },
      { label: "Crane Inspection Compliance", value: pct(l.inspectionCompliance), target: "≥ 98%", tone: l.inspectionCompliance >= 0.98 ? "good" : "warning" },
      { label: "PTW Compliance", value: "98%", target: "≥ 98%", tone: "good" },
      { label: "Equipment Incidents", value: "0", target: "0", tone: "good" },
    ];
    const utilization: Kpi[] = [
      { label: "Utilization Rate", value: pct(l.utilizationRate), target: "≥ 75%", tone: (l.utilizationRate ?? 0) >= 0.75 ? "good" : "warning", trend: trendOf("utilizationRate"), trendGood: "up" },
      { label: "Remaining Useful Life", value: "6.2 yrs", target: "monitor", tone: "neutral" },
      { label: "Asset Replacement Flag", value: String(l.brokenDown + (l.underMaint ?? 0)), target: "review", tone: l.brokenDown > 0 ? "warning" : "good" },
      { label: "Total Assets Tracked", value: String(l.totalAssets), target: "10 categories", tone: "good" },
    ];

    return [
      { name: "Reliability", icon: Activity, items: reliability },
      { name: "Maintenance", icon: Wrench, items: maintenance },
      { name: "Cost", icon: DollarSign, items: cost },
      { name: "Safety & Compliance", icon: ShieldCheck, items: safety },
      { name: "Utilization", icon: Gauge, items: utilization },
    ];
  }, [data]);

  const toneCls: Record<Tone, string> = {
    good: "border-emerald-500/20 bg-emerald-500/5",
    warning: "border-amber-500/20 bg-amber-500/5",
    danger: "border-rose-500/20 bg-rose-500/5",
    neutral: "border-slate-800 bg-slate-900/30",
  };
  const toneText: Record<Tone, string> = {
    good: "text-emerald-400",
    warning: "text-amber-400",
    danger: "text-rose-400",
    neutral: "text-slate-300",
  };

  const trendIcon = (k: Kpi) => {
    if (!k.trend || k.trend === "flat") return <Minus className="w-3 h-3 text-slate-500" />;
    const isGood = k.trendGood ? k.trend === k.trendGood : k.trend === "up";
    const Icon = k.trend === "up" ? TrendingUp : TrendingDown;
    return <Icon className={`w-3 h-3 ${isGood ? "text-emerald-400" : "text-rose-400"}`} />;
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      <AppHeader />
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">KPI Dashboard</h2>
            <p className="text-xs text-slate-400 font-mono">
              22 KPIs · 5 categories · LIMSL-MAIN-REG-007–012
            </p>
          </div>
        </div>

        {loading || !data ? (
          <div className="py-24 flex justify-center items-center text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            <span className="text-xs ml-2 font-mono">Loading KPIs…</span>
          </div>
        ) : (
          <>
            {/* KPI category groups */}
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <section key={cat.name} className="space-y-3">
                  <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                    <Icon className="w-4 h-4 text-emerald-400" /> {cat.name}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {cat.items.map((k) => (
                      <div key={k.label} className={`p-4 rounded-xl border ${toneCls[k.tone]}`}>
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">
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
                        <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="availability" name="Availability" stroke="#34d399" fill="url(#av)" strokeWidth={2} />
                    <Line type="monotone" dataKey="pm" name="PM Compliance" stroke="#38bdf8" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="inspection" name="Inspection" stroke="#a78bfa" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="MTBF (hrs) vs MTTR (hrs)">
                <ResponsiveContainer width="100%" height={240}>
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis yAxisId="l" stroke="#64748b" fontSize={11} />
                    <YAxis yAxisId="r" orientation="right" stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="l" dataKey="mtbf" name="MTBF" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={28} />
                    <Line yAxisId="r" type="monotone" dataKey="mttr" name="MTTR" stroke="#fb7185" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Maintenance & Downtime Cost (₦M)">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="maintCost" name="Maintenance" fill="#38bdf8" radius={[3, 3, 0, 0]} maxBarSize={20} />
                    <Bar dataKey="downtimeCost" name="Downtime" fill="#fb7185" radius={[3, 3, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Production Revenue (₦M)">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                    <YAxis stroke="#64748b" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#34d399" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Per-equipment drill-down */}
            {data.perEquipment.length > 0 && (
              <div className="bg-[#0f172a]/40 border border-slate-800 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200">Per-Equipment Drill-Down (latest)</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400">
                        <th className="py-2.5 px-5 font-medium">Equipment</th>
                        <th className="py-2.5 px-4 font-medium">Availability</th>
                        <th className="py-2.5 px-4 font-medium">MTBF</th>
                        <th className="py-2.5 px-4 font-medium">MTTR</th>
                        <th className="py-2.5 px-4 font-medium">Downtime</th>
                        <th className="py-2.5 px-4 font-medium">Maint. Cost</th>
                        <th className="py-2.5 px-4 font-medium">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {data.perEquipment.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-900/30">
                          <td className="py-2.5 px-5 font-medium text-slate-200">{r.equipmentName}</td>
                          <td className="py-2.5 px-4">{pct(r.availability)}</td>
                          <td className="py-2.5 px-4 text-slate-300">{r.mtbf} hrs</td>
                          <td className="py-2.5 px-4 text-slate-300">{r.mttr} hrs</td>
                          <td className="py-2.5 px-4 text-slate-300">{r.downtimeHours} hrs</td>
                          <td className="py-2.5 px-4 font-mono text-slate-300">{formatCurrency(r.maintenanceCost)}</td>
                          <td className="py-2.5 px-4 text-slate-400">{r.remark}</td>
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
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 8,
  fontSize: 12,
  color: "#e2e8f0",
};

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#0f172a]/40 border border-slate-800 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-slate-200 mb-4">{title}</h3>
      {children}
    </div>
  );
}
