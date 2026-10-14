// src/app/settings/categories/[code]/page.tsx
// Asset Category Digital Twin Page
//
// Mirrored after the equipment digital twin:
// - Comprehensive header with category identity and code
// - Top-priority Dashboard-style MetricPanel (operational availability, next due PM, pending PMs, schedule anchor)
// - Digital twin fleet health status banner
// - Tabbed navigation: Machinery Roster, Safety & Compliance Documents (WMS, JHA, PTW, WO), Activities & PMs, and Collision-Free Calendar Matrix.
"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Calendar,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  FileText,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Pencil,
  Activity,
  ClipboardList,
  CalendarDays,
  ShieldAlert,
} from "lucide-react";
import { PAGE_MAIN } from "@/lib/page-shell";
import PageHeader from "@/components/PageHeader";
import MetricPanel, { Metric } from "@/components/MetricPanel";
import Tabs, { TabItem } from "@/components/Tabs";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import PageSkeleton from "@/components/Skeleton";
import { formatDate } from "@/lib/utils";
import { FREQUENCY_LABELS } from "@/lib/constants";
import { ASSET_CATEGORY_ROLES } from "@/lib/roles";

type CategoryData = {
  category: {
    code: string;
    label: string;
    maintenanceFrequency: string;
    defaultStartDate: string | null;
  };
  stats: {
    totalMachines: number;
    workingCount: number;
    faultyCount: number;
    decommissionedCount: number;
    workingPercentage: number;
  };
  nextDue: {
    date: string | null;
    daysAway: number | null;
    isOverdue: boolean;
  };
  pendingPMs: {
    count: number;
    items: Array<{
      id: string;
      plannedDate: string;
      activityType: string;
      status: string;
      equipmentName: string;
      assetId: string;
      workOrderId: string | null;
      batchId: string | null;
      responsiblePersonName: string | null;
    }>;
  };
  recentActivities: {
    batches: Array<{
      id: string;
      batchNumber: string;
      title: string;
      category: string;
      plannedDate: string;
      status: string;
      assignedToName: string | null;
      completedDate: string | null;
      createdAt: string;
    }>;
    completedPMs: Array<{
      id: string;
      type: string;
      refNumber: string;
      title: string;
      date: string | null;
      status: string;
      equipmentName?: string;
      assetId?: string;
      responsiblePersonName?: string | null;
    }>;
  };
  documents: {
    wms: Array<{
      id: string;
      wmsNumber: string;
      title: string;
      revision: number;
      status: string;
      effectiveDate: string | null;
      approvedByName: string | null;
      preparedByName: string | null;
    }>;
    jha: Array<{
      id: string;
      jhaNumber: string;
      title: string;
      revision: number;
      status: string;
      wmsRevision: number | null;
      preparedByName: string | null;
      approvedAt: string | null;
    }>;
    ptw: Array<{
      id: string;
      permitNumber: string;
      workDescription: string;
      status: string;
      startDate: string | null;
      expiryDate: string | null;
      equipmentName?: string;
      assetId?: string;
    }>;
    wo: Array<{
      id: string;
      workOrderNumber: string;
      title: string;
      type: string;
      status: string;
      priority: string;
      plannedDate: string | null;
      equipmentName?: string;
      assetId?: string;
      technicianName: string | null;
    }>;
  };
  machines: Array<{
    id: string;
    assetId: string;
    name: string;
    category: string;
    status: string;
    location: string | null;
    criticality: string | null;
    maintenanceFrequency: string | null;
    lastMaintenanceDate: string | null;
  }>;
};

type TabKey = "machines" | "documents" | "activities" | "schedule";

export default function CategoryDetailPage({
  params,
}: {
  params: Promise<{ code: string }> | { code: string };
}) {
  const resolvedParams = use(params as Promise<{ code: string }>);
  const code = decodeURIComponent(resolvedParams.code);

  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const canPropose = mounted && ASSET_CATEGORY_ROLES.includes((session?.user as { role?: string })?.role ?? "");

  const [data, setData] = useState<CategoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("machines");
  const router = useRouter();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/asset-categories/${encodeURIComponent(code)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Category not found");
        return res.json();
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load category dossier");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [code]);

  if (loading) {
    return <PageSkeleton variant="detail" label="Loading category digital twin" />;
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center text-ink-500 text-xs gap-4">
        <AlertTriangle className="w-8 h-8 text-danger-500" />
        <p className="text-sm font-semibold text-ink-900">{error || "Category digital twin not found."}</p>
        <Link href="/settings/categories" className="text-brand-600 underline">
          Return to Asset Categories
        </Link>
      </div>
    );
  }

  const freqLabel = data.category.maintenanceFrequency
    ? FREQUENCY_LABELS[data.category.maintenanceFrequency] ?? data.category.maintenanceFrequency
    : "—";

  // Dashboard-style MetricPanel metrics (prioritized at the top of the page)
  const dashboardMetrics: Metric[] = [
    {
      key: "OPERATIONAL_RATE",
      label: "Operational availability",
      value: `${data.stats.workingPercentage}%`,
      count: data.stats.workingCount,
      target: "95%",
      description: `${data.stats.workingCount} of ${data.stats.totalMachines} machines running`,
      icon: Activity,
      status: data.stats.workingPercentage >= 95 ? "success" : data.stats.workingPercentage >= 75 ? "warning" : "danger",
    },
    {
      key: "NEXT_DUE_PM",
      label: "Next scheduled PM",
      value: data.nextDue.date ? formatDate(data.nextDue.date) : "None planned",
      description:
        data.nextDue.daysAway !== null
          ? data.nextDue.daysAway < 0
            ? `${Math.abs(data.nextDue.daysAway)}d overdue`
            : data.nextDue.daysAway === 0
            ? "Due today"
            : `In ${data.nextDue.daysAway} days`
          : "Not scheduled",
      icon: Calendar,
      status: data.nextDue.daysAway !== null && data.nextDue.daysAway < 0 ? "danger" : "plain",
    },
    {
      key: "ANNUAL_ANCHOR",
      label: "Schedule anchor",
      value: data.category.defaultStartDate ? formatDate(data.category.defaultStartDate) : "Not set",
      description: `${freqLabel} · Collision-free staggered`,
      icon: CalendarDays,
      status: "plain",
    },
    {
      key: "PENDING_PMS",
      label: "Pending PM activities",
      value: String(data.pendingPMs.count),
      count: data.pendingPMs.count,
      description: data.pendingPMs.count === 1 ? "1 activity queued" : `${data.pendingPMs.count} activities queued`,
      icon: ClipboardList,
      status: data.pendingPMs.count > 0 ? "warning" : "plain",
    },
  ];

  // Fleet health status banner (mirrored after digital twin asset status banner)
  const hasFaults = data.stats.faultyCount > 0;
  const statusBanner = hasFaults
    ? {
        panel: "bg-danger-50 border-danger-200",
        icon: "bg-danger-500/10 text-danger-600",
        Icon: AlertTriangle,
        headline: `${data.stats.faultyCount} of ${data.stats.totalMachines} machines are currently faulty or under maintenance`,
        subtext: "Production capacity in this category is constrained. Check open corrective work orders.",
        ctaLabel: "View Faulty Equipment",
        ctaHref: "#machines-roster",
      }
    : {
        panel: "bg-brand-50 border-brand-200",
        icon: "bg-brand-500/10 text-brand-600",
        Icon: CheckCircle2,
        headline: `All ${data.stats.totalMachines} machines in this category are fully operational`,
        subtext: `Governed by standing ${freqLabel.toLowerCase()} PM schedule starting ${data.category.defaultStartDate ? formatDate(data.category.defaultStartDate) : "on schedule"}.`,
        ctaLabel: "View PM Schedule",
        ctaHref: `/schedule?filter=${encodeURIComponent(data.category.code)}`,
      };

  const tabs: readonly TabItem<TabKey>[] = [
    { value: "machines", label: "Machinery Roster", count: data.stats.totalMachines },
    {
      value: "documents",
      label: "Safety & Compliance Documents",
      count:
        data.documents.wms.length +
        data.documents.jha.length +
        data.documents.ptw.length +
        data.documents.wo.length,
    },
    { value: "activities", label: "Activities & Batches", count: data.pendingPMs.count },
    { value: "schedule", label: "Collision-Free Schedule" },
  ];

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        {/* Page Header with Breadcrumbs and Actions */}
        <PageHeader
          title={data.category.label}
          subtitle={`Governs ${data.stats.totalMachines} machines · ${freqLabel} maintenance regime`}
          code={data.category.code}
          backHref="/settings/categories"
          backLabel="Asset Categories"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                href={`/schedule?filter=${encodeURIComponent(data.category.code)}`}
                icon={Calendar}
              >
                View in Schedule
              </Button>
              {canPropose && (
                <Button
                  size="sm"
                  href={`/settings/categories?change=${encodeURIComponent(data.category.code)}`}
                  icon={Pencil}
                >
                  Propose Change
                </Button>
              )}
            </div>
          }
        />

        {/* ── 1. Top-Priority Metrics (Dashboard-Style MetricPanel) ────────── */}
        <section aria-label="Category performance measures">
          <MetricPanel label="Category key measures" metrics={dashboardMetrics} />
        </section>

        {/* ── 2. Digital Twin Fleet Health Banner ──────────────────────────── */}
        <section
          className={`p-5 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${statusBanner.panel}`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-2.5 rounded-lg shrink-0 ${statusBanner.icon}`}>
              <statusBanner.Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink-900">{statusBanner.headline}</h2>
              <p className="text-xs text-ink-600 mt-0.5">{statusBanner.subtext}</p>
            </div>
          </div>
          <Button
            variant={hasFaults ? "danger" : "secondary"}
            size="sm"
            href={statusBanner.ctaHref}
            icon={hasFaults ? AlertTriangle : Calendar}
            className="shrink-0"
          >
            {statusBanner.ctaLabel}
          </Button>
        </section>

        {/* ── 3. Tabbed Content Sections ───────────────────────────────────── */}
        <section className="space-y-4">
          <div className="border-b border-line">
            <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Category digital twin tabs" />
          </div>

          {/* TAB 1: MACHINERY ROSTER */}
          {tab === "machines" && (
            <div id="machines-roster" className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">Equipment in this category</h3>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Every asset below inherits the {freqLabel.toLowerCase()} maintenance interval from this category.
                  </p>
                </div>
                <span className="text-xs text-ink-500 font-medium">
                  {data.stats.workingCount} working / {data.stats.faultyCount} down
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-ink-500 text-xs">
                      <th className="py-2.5 px-4 font-medium">Asset ID</th>
                      <th className="py-2.5 px-4 font-medium">Machine Name</th>
                      <th className="py-2.5 px-4 font-medium">Status</th>
                      <th className="py-2.5 px-4 font-medium">Location</th>
                      <th className="py-2.5 px-4 font-medium">Criticality</th>
                      <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {data.machines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-ink-500">
                          No equipment registered under this category yet.
                        </td>
                      </tr>
                    ) : (
                      data.machines.map((m) => {
                        const isWorking = m.status === "OPERATIONAL";
                        return (
                          <tr key={m.id} className="hover:bg-ink-50 transition-colors">
                            <td className="py-3 px-4 font-semibold text-ink-900">
                              <Link
                                href={`/equipment/${m.assetId.replace(/\//g, "-")}`}
                                className="text-brand-600 hover:underline inline-flex items-center gap-1"
                              >
                                <span>{m.assetId}</span>
                                <ExternalLink className="w-3 h-3 text-brand-400" />
                              </Link>
                            </td>
                            <td className="py-3 px-4 text-ink-900 font-medium">{m.name}</td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium ${
                                  isWorking
                                    ? "bg-success-500/10 text-success-700 border border-success-500/20"
                                    : "bg-danger-500/10 text-danger-700 border border-danger-500/20"
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    isWorking ? "bg-success-500" : "bg-danger-500"
                                  }`}
                                />
                                <span>{m.status.replace(/_/g, " ")}</span>
                              </span>
                            </td>
                            <td className="py-3 px-4 text-ink-600 text-xs">{m.location || "—"}</td>
                            <td className="py-3 px-4">
                              {m.criticality ? (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                                    m.criticality === "CRITICAL"
                                      ? "bg-danger-100 text-danger-700"
                                      : m.criticality === "HIGH"
                                      ? "bg-warn-100 text-warn-700"
                                      : "bg-ink-100 text-ink-700"
                                  }`}
                                >
                                  {m.criticality}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={`/equipment/${m.assetId.replace(/\//g, "-")}`}
                                className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                              >
                                Digital Twin →
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: SAFETY & COMPLIANCE DOCUMENTS */}
          {tab === "documents" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Standing Work Method Statements (WMS) */}
              <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-semibold text-ink-900">Standing Work Method Statements (WMS)</h3>
                  </div>
                  <span className="text-xs text-ink-500">{data.documents.wms.length} filed</span>
                </div>
                {data.documents.wms.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <p className="text-xs text-ink-500">No standing method statement registered for this category.</p>
                    <Link
                      href={`/wms/new?category=${encodeURIComponent(data.category.code)}`}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      Draft a standing WMS →
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-ink-100">
                    {data.documents.wms.map((doc) => (
                      <div key={doc.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-900">{doc.wmsNumber}</span>
                            <Badge className="bg-brand-50 text-brand-700 border-brand-200">Rev {doc.revision}</Badge>
                            <span className="text-xs text-ink-400">· {doc.status}</span>
                          </div>
                          <p className="text-xs text-ink-600 truncate mt-1">{doc.title}</p>
                          {doc.preparedByName && (
                            <p className="text-xs text-ink-400 mt-0.5">Author: {doc.preparedByName}</p>
                          )}
                        </div>
                        <Link
                          href={`/wms/${doc.id}`}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0 inline-flex items-center gap-1"
                        >
                          <span>Open WMS</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Job Hazard Analysis (JHA) */}
              <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-brand-600" />
                    <h3 className="text-sm font-semibold text-ink-900">Job Hazard Analysis (JHA)</h3>
                  </div>
                  <span className="text-xs text-ink-500">{data.documents.jha.length} filed</span>
                </div>
                {data.documents.jha.length === 0 ? (
                  <div className="p-6 text-center space-y-2">
                    <p className="text-xs text-ink-500">No hazard analysis filed for this category.</p>
                    <Link
                      href={`/jha/new?category=${encodeURIComponent(data.category.code)}`}
                      className="text-xs font-semibold text-brand-600 hover:underline"
                    >
                      Raise JHA from approved WMS →
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-ink-100">
                    {data.documents.jha.map((doc) => (
                      <div key={doc.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-900">{doc.jhaNumber}</span>
                            <Badge className="bg-brand-50 text-brand-700 border-brand-200">Rev {doc.revision}</Badge>
                            <span className="text-xs text-ink-400">· {doc.status}</span>
                          </div>
                          <p className="text-xs text-ink-600 truncate mt-1">{doc.title}</p>
                        </div>
                        <Link
                          href={`/jha/${doc.id}`}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0 inline-flex items-center gap-1"
                        >
                          <span>Open JHA</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Permits to Work (PTW) */}
              <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-900">Recent Permits to Work (PTW)</h3>
                  <span className="text-xs text-ink-500">{data.documents.ptw.length} recent</span>
                </div>
                {data.documents.ptw.length === 0 ? (
                  <p className="p-6 text-center text-xs text-ink-500">No recent permits raised for this category.</p>
                ) : (
                  <div className="divide-y divide-ink-100">
                    {data.documents.ptw.map((p) => (
                      <div key={p.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-900">{p.permitNumber}</span>
                            <span className="text-xs text-ink-400">· {p.status}</span>
                          </div>
                          <p className="text-xs text-ink-600 truncate mt-1">{p.workDescription}</p>
                          {p.equipmentName && (
                            <p className="text-xs text-ink-400 mt-0.5">
                              {p.equipmentName} ({p.assetId})
                            </p>
                          )}
                        </div>
                        <Link
                          href={`/permits/${p.id}`}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0 inline-flex items-center gap-1"
                        >
                          <span>View PTW</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Work Orders (WO) */}
              <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-900">Recent Work Orders (WO)</h3>
                  <span className="text-xs text-ink-500">{data.documents.wo.length} recent</span>
                </div>
                {data.documents.wo.length === 0 ? (
                  <p className="p-6 text-center text-xs text-ink-500">No recent work orders found for this category.</p>
                ) : (
                  <div className="divide-y divide-ink-100">
                    {data.documents.wo.map((w) => (
                      <div key={w.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-900">{w.workOrderNumber}</span>
                            <span className="px-1.5 py-0.5 rounded bg-ink-100 text-xs font-semibold text-ink-700">
                              {w.type}
                            </span>
                            <span className="text-xs text-ink-400">· {w.status}</span>
                          </div>
                          <p className="text-xs text-ink-600 truncate mt-1">{w.title}</p>
                        </div>
                        <Link
                          href={`/work-orders/${w.id}`}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0 inline-flex items-center gap-1"
                        >
                          <span>Open WO</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: ACTIVITIES & PM BATCHES */}
          {tab === "activities" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Recent PM Batches */}
              <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-900">Recent Category PM Batches</h3>
                  <span className="text-xs text-ink-500">{data.recentActivities.batches.length} batches</span>
                </div>
                {data.recentActivities.batches.length === 0 ? (
                  <p className="p-6 text-center text-xs text-ink-500">No PM batches raised for this category yet.</p>
                ) : (
                  <div className="divide-y divide-ink-100">
                    {data.recentActivities.batches.map((b) => (
                      <div key={b.id} className="p-4 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-900">{b.batchNumber}</span>
                            <Badge className="bg-brand-50 text-brand-700 border-brand-200">{b.status}</Badge>
                          </div>
                          <p className="text-xs text-ink-600 truncate mt-1">{b.title}</p>
                          <p className="text-xs text-ink-400 mt-0.5">
                            Planned: {formatDate(b.plannedDate)}
                            {b.assignedToName ? ` · Lead: ${b.assignedToName}` : ""}
                          </p>
                        </div>
                        <Link
                          href={`/pm-batches/${b.id}`}
                          className="text-xs font-semibold text-brand-600 hover:text-brand-700 shrink-0 inline-flex items-center gap-1"
                        >
                          <span>Open Batch</span>
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Pending PM Schedule Items */}
              <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-line flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-900">Pending PM Schedule Items</h3>
                  <span className="text-xs text-ink-500">{data.pendingPMs.count} pending</span>
                </div>
                {data.pendingPMs.items.length === 0 ? (
                  <p className="p-6 text-center text-xs text-ink-500">No pending PM activities for this category.</p>
                ) : (
                  <div className="divide-y divide-ink-100 max-h-96 overflow-y-auto">
                    {data.pendingPMs.items.map((item) => (
                      <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink-900">{item.equipmentName}</span>
                            <span className="text-ink-400">({item.assetId})</span>
                          </div>
                          <p className="text-ink-500 mt-0.5">
                            Planned Date: {formatDate(item.plannedDate)} · Status: {item.status}
                            {item.responsiblePersonName ? ` · Assignee: ${item.responsiblePersonName}` : ""}
                          </p>
                        </div>
                        {item.batchId ? (
                          <Link
                            href={`/pm-batches/${item.batchId}`}
                            className="text-xs font-semibold text-brand-600 hover:underline shrink-0"
                          >
                            Batch →
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-400 shrink-0">Unbatched</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: COLLISION-FREE SCHEDULE MATRIX */}
          {tab === "schedule" && (
            <div className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">Annual Staggered PM Schedule</h3>
                  <p className="text-xs text-ink-500 mt-1 max-w-2xl leading-relaxed">
                    This category follows the <strong className="text-ink-900">{freqLabel}</strong> regime, anchored to
                    annual start date{" "}
                    <strong className="text-ink-900">
                      {data.category.defaultStartDate ? formatDate(data.category.defaultStartDate) : "TBD"}
                    </strong>
                    . By rule, no other category is permitted to share any of these scheduled PM days.
                  </p>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success-500/10 border border-success-500/20 text-xs font-semibold text-success-700">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Collision-Free Guarantee Active</span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-line bg-canvas space-y-3">
                <span className="text-xs font-semibold text-ink-700">Upcoming Planned Service Dates for 2026:</span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {data.pendingPMs.items.slice(0, 6).map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-2.5 rounded-lg border border-line bg-surface text-center space-y-1"
                    >
                      <span className="text-xs font-semibold text-brand-700 block">
                        {formatDate(item.plannedDate)}
                      </span>
                      <span className="text-xs text-ink-500 block">{item.status}</span>
                    </div>
                  ))}
                  {data.pendingPMs.items.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-ink-500">
                      Schedule dates will appear on the calendar based on anchor {formatDate(data.category.defaultStartDate)}.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
