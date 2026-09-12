// src/app/kpi/page.tsx
"use client";

import { useMemo } from "react";
import { useApi } from "@/lib/api-cache";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { Activity, Wrench, Layers, ShieldCheck, Gauge } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import PageLead from "@/components/PageLead";
import MetricPanel, { type Metric } from "@/components/MetricPanel";
import TableSkeleton from "@/components/TableSkeleton";
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
  // The raw number when the value is a plain count, which is what lets the zero
  // rule apply: "Safety incidents: 0" must not be coloured like a real one.
  count?: number;
  trend?: Trend;
  trendGood?: "up" | "down"; // which direction is good
  // Says what the number does NOT cover, where the underlying data is partial.
  // A caveated figure can be argued with; a bare one gets believed.
  note?: string;
};

// An em dash for "no data". This read `", "` — a stray comma and a space,
// which rendered as an almost invisible smudge where a figure should be.
const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `${(n * 100).toFixed(1)}%`;

export default function KpiPage() {
  const { data, loading } = useApi<KpiData | null>("/api/kpi", null);

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
    // Guard against an error body (HTTP 200 but no live/monthly), the fetch
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

    // Four to a group, and every measure appears exactly once. Inspection
    // Compliance and Overdue Activities were each rendered twice, in different
    // groups, which makes a reader check whether the two are really the same
    // number. "Maint. Cost: Not tracked" was a placeholder holding a slot the
    // size of a real measurement.
    const reliability: Kpi[] = [
      { label: "MTBF", value: l.mtbf == null ? "—" : `${Math.round(l.mtbf)} hrs`, target: "≥ 200 hrs", tone: (l.mtbf ?? 0) >= 200 ? "good" : "warning", trend: trendOf("mtbf"), trendGood: "up" },
      { label: "Assets available now", value: pct(l.availability), target: "≥ 90%", tone: (l.availability ?? 0) >= 0.9 ? "good" : "warning", trend: trendOf("availability"), trendGood: "up" },
      { label: "Breakdown frequency", value: `${lastMo}/mo`, count: lastMo, target: "≤ 2/mo", tone: lastMo <= 2 ? "good" : "warning", trend: trendOf("breakdownFrequency"), trendGood: "down" },
      { label: "Active breakdowns", value: String(l.brokenDown), count: l.brokenDown, target: "", note: "Target is none", tone: l.brokenDown === 0 ? "good" : "danger" },
    ];
    const maintenance: Kpi[] = [
      { label: "MTTR", value: l.mttr == null ? "—" : `${l.mttr.toFixed(1)} hrs`, target: "≤ 4 hrs", tone: (l.mttr ?? 0) <= 4 ? "good" : "warning", trend: trendOf("mttr"), trendGood: "down" },
      { label: "PM compliance", value: pct(l.pmCompliance), target: "≥ 95%", tone: (l.pmCompliance ?? 0) >= 0.95 ? "good" : (l.pmCompliance ?? 0) >= 0.5 ? "warning" : "danger", trend: trendOf("pmCompliance"), trendGood: "up" },
      {
        label: "Maintenance backlog",
        value: `${l.maintenanceBacklog ?? 0} MH`,
        count: l.maintenanceBacklog ?? 0,
        target: "≤ 40 MH",
        tone: (l.maintenanceBacklog ?? 0) <= 40 ? "good" : "warning",
        note:
          l.openWosTotal
            ? `${l.backlogEstimated ?? 0} of ${l.openWosTotal} estimated, the rest at ${l.medianJobHours ?? 2}h median`
            : undefined,
      },
      { label: "Open work orders", value: String(l.openWos), count: l.openWos, target: "", note: "Monitored, no threshold", tone: "neutral" },
    ];
    const throughput: Kpi[] = [
      { label: "WO completion rate", value: pct(l.woCompletionRate), target: "≥ 90%", tone: (l.woCompletionRate ?? 0) >= 0.9 ? "good" : "warning" },
      { label: "Failure rate", value: `${(l.failureRate ?? 0).toFixed(2)}`, target: "", note: "Failures per asset, per month", tone: (l.failureRate ?? 0) <= 0.2 ? "good" : "warning" },
      { label: "Downtime, 6 months", value: `${downtimeWindow.toFixed(0)} hrs`, count: Math.round(downtimeWindow), target: "", note: "Should be trending down", tone: "neutral" },
      { label: "Breakdowns, 6 months", value: String(l.breakdownsWindow ?? 0), count: l.breakdownsWindow ?? 0, target: "", note: "Should be trending down", tone: "neutral" },
    ];
    const safety: Kpi[] = [
      {
        label: "PTW close-out",
        value: pct(l.ptwCompliance),
        target: "≥ 98%",
        tone: l.ptwCompliance == null ? "neutral" : l.ptwCompliance >= 0.98 ? "good" : "warning",
        note: l.ptwWentToWork
          ? `${l.ptwWentToWork} authorised, ${l.ptwClosedLate ?? 0} late, ${l.ptwNotClosed ?? 0} never closed`
          : "No permits have authorised work yet",
      },
      { label: "Inspection compliance", value: pct(l.inspectionCompliance), target: "≥ 98%", tone: (l.inspectionCompliance ?? 0) >= 0.98 ? "good" : "warning", trend: trendOf("inspectionCompliance"), trendGood: "up" },
      { label: "Overdue activities", value: String(l.overdueActivities ?? 0), count: l.overdueActivities ?? 0, target: "", note: "Target is none", tone: (l.overdueActivities ?? 0) === 0 ? "good" : "warning" },
      { label: "Safety incidents", value: String(l.safetyIncidents ?? 0), count: l.safetyIncidents ?? 0, target: "", note: "Target is none", tone: (l.safetyIncidents ?? 0) === 0 ? "good" : "danger" },
    ];
    const assets: Kpi[] = [
      { label: "Total assets", value: String(l.totalAssets), count: l.totalAssets, target: "", note: "Every machine, system and serviced unit", tone: "neutral" },
      { label: "Operational", value: String(l.operational ?? 0), count: l.operational ?? 0, target: "", note: "Available for production now", tone: "neutral" },
      { label: "Under maintenance", value: String(l.underMaint ?? 0), count: l.underMaint ?? 0, target: "", note: "Out of service by plan", tone: (l.underMaint ?? 0) === 0 ? "good" : "warning" },
      { label: "Broken down", value: String(l.brokenDown), count: l.brokenDown, target: "", note: "Target is none", tone: l.brokenDown === 0 ? "good" : "danger" },
    ];

    return [
      { name: "Reliability", icon: Activity, items: reliability },
      { name: "Maintenance", icon: Wrench, items: maintenance },
      { name: "Throughput", icon: Gauge, items: throughput },
      { name: "Safety & compliance", icon: ShieldCheck, items: safety },
      { name: "Asset status", icon: Layers, items: assets },
    ];
  }, [data]);

  // Worst-first, the same rule as the dashboard. A page of twenty numbers has
  // no opinion; the reader has to rank them, every time they open it. This
  // states which target is being missed and by how much.
  const lead = useMemo(() => {
    const l = data?.live;
    if (!l) return null;

    const misses: { text: string; href: string; label: string }[] = [];
    if ((l.brokenDown ?? 0) > 0) {
      misses.push({
        text: `${l.brokenDown === 1 ? "One machine is" : `${l.brokenDown} machines are`} down.`,
        href: "/corrective",
        label: "Open corrective records",
      });
    }
    if (l.pmCompliance != null && l.pmCompliance < 0.95) {
      misses.push({
        text: `PM compliance is ${pct(l.pmCompliance)}, against a 95% target.`,
        href: "/schedule",
        label: "Open the schedule",
      });
    }
    if ((l.overdueActivities ?? 0) > 0) {
      misses.push({
        text: `${l.overdueActivities === 1 ? "One activity is" : `${l.overdueActivities} activities are`} overdue.`,
        href: "/schedule",
        label: "Open the schedule",
      });
    }
    if (l.availability != null && l.availability < 0.9) {
      misses.push({
        text: `Availability is ${pct(l.availability)}, against a 90% target.`,
        href: "/equipment",
        label: "Open the register",
      });
    }

    const pm = Math.round((l.pmCompliance ?? 0) * 100);
    return {
      headline: misses[0]?.text ?? "Every maintenance target is being met.",
      supporting:
        misses.length > 1
          ? `${misses.length} targets are being missed. This one costs the most, and the panels below show the rest.`
          : misses.length === 1
            ? "Everything else on this page is within target."
            : "Availability, PM compliance and permit close-out are all at or above their thresholds.",
      action: misses[0] ?? { href: "/schedule", label: "Open the schedule" },
      pm,
      pmTone: (pm >= 95 ? "good" : pm >= 50 ? "warn" : "bad") as "good" | "warn" | "bad",
      stats: [
        { label: "down", value: l.brokenDown ?? 0, tone: "bad" as const },
        { label: "overdue", value: l.overdueActivities ?? 0, tone: "warn" as const },
        { label: "open WOs", value: l.openWos ?? 0 },
      ],
    };
  }, [data]);

  // Tinting twenty cells by status turned the page into a traffic light with no
  // hierarchy: everything shouted at once and nothing led. The status now lives
  // on the figure, where MetricPanel already puts it.
  const STATUS: Record<Tone, Metric["status"]> = {
    good: "success",
    warning: "warning",
    danger: "danger",
    neutral: "plain",
  };

  const asMetrics = (items: Kpi[]): Metric[] =>
    items.map((k) => ({
      key: k.label,
      label: k.label,
      value: k.value,
      count: k.count,
      target: k.target || undefined,
      description: k.note,
      status: STATUS[k.tone],
      trend: k.trend,
      trendGood: k.trendGood,
    }));

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
        <PageHeader
          title="KPI Dashboard"
          subtitle="Computed live from work orders, breakdowns, PM and permits over the last 6 months"
        />

        {loading || !data ? (
          <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <TableSkeleton rows={6} cols={5} />
          </div>
        ) : (
          <>
            {lead && (
              <PageLead
                headingId="kpi-lead"
                headline={lead.headline}
                supporting={lead.supporting}
                actions={[{ href: lead.action.href, label: lead.action.label }]}
                figure={{
                  label: "PM compliance",
                  value: String(lead.pm),
                  unit: "%",
                  progress: lead.pm,
                  tone: lead.pmTone,
                }}
                stats={lead.stats}
                meta={<span>Computed live over the last 6 months · target 95%</span>}
              />
            )}

            {/* One panel per group, not twenty floating cards. */}
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <section key={cat.name} className="space-y-3">
                  <h2 className="text-sm font-semibold text-ink-700 flex items-center gap-2">
                    <Icon className="w-4 h-4 text-ink-400" /> {cat.name}
                  </h2>
                  <MetricPanel label={cat.name} metrics={asMetrics(cat.items)} />
                </section>
              );
            })}

            {/* Trend charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard
                title="Equipment Availability over time (%), production hours lost to all maintenance"
                data={chartData}
                series={[{ key: "availability", label: "Availability %" }]}
              >
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

              <ChartCard
                title="MTBF (hrs) vs MTTR (hrs)"
                data={chartData}
                series={[{ key: "mtbf", label: "MTBF (hrs)" }, { key: "mttr", label: "MTTR (hrs)" }]}
              >
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

              <ChartCard
                title="Breakdowns & Downtime (hrs)"
                data={chartData}
                series={[{ key: "breakdowns", label: "Breakdowns" }, { key: "downtime", label: "Downtime (hrs)" }]}
              >
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

              <ChartCard
                title="PM Compliance (%)"
                data={chartData}
                series={[{ key: "pm", label: "PM %" }, { key: "inspection", label: "Inspection %" }]}
              >
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

            {/* Already ordered worst-first by the compute step. It was
                titled "Per-Equipment Drill-Down", which reads as an unordered
                reference table, so nobody could tell that the top row is the
                machine costing the most production. */}
            {data.perEquipment.length > 0 && (
              <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-6 py-4 border-b border-ink-200">
                  <h3 className="text-sm font-semibold text-ink-900">
                    Worst-performing assets, last 6 months
                  </h3>
                  <p className="text-xs text-ink-500 mt-1">
                    Ordered by production hours lost, then by number of breakdowns. The top of this
                    list is where a replacement decision starts.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-ink-200 text-ink-500">
                        <th className="py-2.5 px-5 font-medium w-10">#</th>
                        <th className="py-2.5 px-5 font-medium">Equipment</th>
                        <th className="py-3 px-5 font-medium">Breakdowns</th>
                        <th className="py-3 px-5 font-medium">Availability</th>
                        <th className="py-3 px-5 font-medium">MTBF</th>
                        <th className="py-3 px-5 font-medium">MTTR</th>
                        <th className="py-3 px-5 font-medium">Downtime</th>
                        <th className="py-3 px-5 font-medium">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-200">
                      {data.perEquipment.map((r, i) => (
                        <tr key={r.id} className="hover:bg-ink-50">
                          <td className="py-2.5 px-5 text-ink-400 tabular-nums">{i + 1}</td>
                          <td className="py-2.5 px-5 font-medium text-ink-900">{r.equipmentName}</td>
                          <td className="py-3 px-5 text-ink-700 tabular-nums">{r.breakdowns}</td>
                          <td className="py-3 px-5 tabular-nums">{pct(r.availability)}</td>
                          {/* Both of these read `", "`, a comma and a space
                              where a figure should be. */}
                          <td className="py-3 px-5 text-ink-700 tabular-nums">
                            {r.mtbf == null ? "\u2014" : `${r.mtbf} hrs`}
                          </td>
                          <td className="py-3 px-5 text-ink-700 tabular-nums">
                            {r.mttr == null ? "\u2014" : `${r.mttr} hrs`}
                          </td>
                          <td className="py-3 px-5 text-ink-700 tabular-nums">{r.downtimeHours} hrs</td>
                          <td className="py-3 px-5 text-ink-500">{r.remark}</td>
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

function ChartCard({
  title,
  children,
  series,
  data,
}: {
  title: string;
  children: React.ReactNode;
  // The same numbers the chart draws, as a table. A trend line conveys its
  // meaning by shape alone, nothing at all for a screen reader, and nothing on
  // a greyscale print, which is how these get attached to an audit pack. The
  // figures exist; withholding them was the only problem.
  series?: { key: string; label: string }[];
  data?: Record<string, string | number>[];
}) {
  return (
    <div className="bg-surface border border-line rounded-xl shadow-card p-5">
      <h3 className="text-sm font-semibold text-ink-900 mb-4">{title}</h3>
      <div role="img" aria-label={`${title}. The same figures are given in the table below.`}>
        {children}
      </div>

      {series && data && data.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-900 select-none">
            Show these figures as a table
          </summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="text-ink-500 border-b border-ink-200">
                  <th scope="col" className="py-1.5 pr-3 font-semibold">Month</th>
                  {series.map((s) => (
                    <th key={s.key} scope="col" className="py-1.5 px-3 font-semibold text-right">
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.map((row, i) => (
                  <tr key={i}>
                    <th scope="row" className="py-1.5 pr-3 font-medium text-ink-700">
                      {row.name}
                    </th>
                    {series.map((s) => (
                      <td key={s.key} className="py-1.5 px-3 text-right tabular-nums text-ink-600">
                        {row[s.key] ?? "-"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
