// src/components/CategoryDetailModal.tsx
// Comprehensive dossier modal for an asset category:
// - Category identity, maintenance frequency, and collision-free annual start date
// - Machine health: working (operational) vs faulty (breakdown, under maintenance, awaiting parts)
// - Next due PM date and countdown
// - Pending PMs count and schedule list
// - Safety & compliance documents: standing WMS, JHA, recent PTWs, and Work Orders
// - Recent activities & PM batches
// - Complete machine roster for this category
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import Modal from "@/components/Modal";
import Tabs, { TabItem } from "@/components/Tabs";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import { formatDate } from "@/lib/utils";
import { FREQUENCY_LABELS, ACTIVITY_TYPE_BADGE, SCHEDULE_STATUS_BADGE, WO_STATUS_BADGE } from "@/lib/constants";

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

type TabKey = "overview" | "documents" | "activities" | "machines";

export default function CategoryDetailModal({
  categoryCode,
  open,
  onClose,
  onProposeChange,
  canPropose = false,
}: {
  categoryCode: string | null;
  open: boolean;
  onClose: () => void;
  onProposeChange?: () => void;
  canPropose?: boolean;
}) {
  const [data, setData] = useState<CategoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!open || !categoryCode) {
      setData(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/asset-categories/${encodeURIComponent(categoryCode)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not load category information");
        return res.json();
      })
      .then((d) => {
        if (active) {
          setData(d);
          setTab("overview");
        }
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
  }, [open, categoryCode]);

  if (!open) return null;

  const freqLabel = data?.category.maintenanceFrequency
    ? FREQUENCY_LABELS[data.category.maintenanceFrequency] ?? data.category.maintenanceFrequency
    : "—";

  const tabs: readonly TabItem<TabKey>[] = [
    { value: "overview", label: "Overview" },
    { value: "documents", label: "Documents", count: (data?.documents.wms.length ?? 0) + (data?.documents.jha.length ?? 0) + (data?.documents.ptw.length ?? 0) + (data?.documents.wo.length ?? 0) },
    { value: "activities", label: "Activities & PMs", count: data?.pendingPMs.count ?? 0 },
    { value: "machines", label: "Machines", count: data?.stats.totalMachines ?? 0 },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={data ? data.category.label : "Asset Category Dossier"}
      subtitle={
        data
          ? `${data.category.code} · Serviced ${freqLabel}`
          : "Category maintenance profile and linked safety records"
      }
      maxWidthClass="max-w-3xl"
    >
      {loading ? (
        <div className="py-12 text-center space-y-3">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-ink-500">Loading category information and linked safety records…</p>
        </div>
      ) : error || !data ? (
        <div className="py-8 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-danger-500 mx-auto" />
          <p className="text-sm font-medium text-ink-900">{error || "Category details unavailable"}</p>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top Key Metric Panels */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* 1. Working vs Faulty Machines */}
            <div className="p-3 rounded-xl border border-line bg-surface flex flex-col justify-between">
              <span className="text-xs text-ink-500">Machine status</span>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-xl font-bold text-success-700 tabular-nums">
                  {data.stats.workingCount}
                </span>
                <span className="text-xs text-ink-400">working</span>
                {data.stats.faultyCount > 0 && (
                  <span className="text-xs font-semibold text-danger-600">
                    / {data.stats.faultyCount} faulty
                  </span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
                <span className="w-2 h-2 rounded-full bg-success-500 shrink-0" />
                <span>{data.stats.workingPercentage}% operational</span>
              </div>
            </div>

            {/* 2. Next Due PM */}
            <div className="p-3 rounded-xl border border-line bg-surface flex flex-col justify-between">
              <span className="text-xs text-ink-500">Next due PM</span>
              <div className="mt-1.5">
                <span className="text-sm font-bold text-ink-900">
                  {data.nextDue.date ? formatDate(data.nextDue.date) : "—"}
                </span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs">
                {data.nextDue.daysAway !== null ? (
                  data.nextDue.daysAway < 0 ? (
                    <span className="font-semibold text-danger-600">
                      {Math.abs(data.nextDue.daysAway)}d overdue
                    </span>
                  ) : data.nextDue.daysAway === 0 ? (
                    <span className="font-semibold text-warn-600">Due today</span>
                  ) : (
                    <span className="text-brand-600">In {data.nextDue.daysAway} days</span>
                  )
                ) : (
                  <span className="text-ink-400">Not scheduled</span>
                )}
              </div>
            </div>

            {/* 3. Pending PMs */}
            <div className="p-3 rounded-xl border border-line bg-surface flex flex-col justify-between">
              <span className="text-xs text-ink-500">Pending PMs</span>
              <div className="mt-1.5">
                <span className="text-xl font-bold text-ink-900 tabular-nums">
                  {data.pendingPMs.count}
                </span>
              </div>
              <div className="mt-2 text-xs text-ink-500">
                <span>{data.pendingPMs.count === 1 ? "Activity" : "Activities"} queued</span>
              </div>
            </div>

            {/* 4. Annual Schedule Anchor */}
            <div className="p-3 rounded-xl border border-line bg-surface flex flex-col justify-between">
              <span className="text-xs text-ink-500">Annual start</span>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                <span className="text-sm font-semibold text-ink-900">
                  {data.category.defaultStartDate ? formatDate(data.category.defaultStartDate) : "—"}
                </span>
              </div>
              <div className="mt-2 text-xs text-ink-500 truncate" title="Staggered to prevent category overlap">
                <span>Staggered collision-free</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="border-b border-line">
            <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Category detail tabs" />
          </div>

          {/* Tab Content Panes */}
          <div className="min-h-[260px] max-h-[50vh] overflow-y-auto pr-1">
            {/* ── TAB 1: OVERVIEW ────────────────────────────────────────── */}
            {tab === "overview" && (
              <div className="space-y-4">
                {/* Category Rule Information */}
                <div className="p-3.5 rounded-xl border border-line bg-surface space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-900">Maintenance interval rule</span>
                    <span className="text-xs text-ink-500">Governs all {data.stats.totalMachines} machines</span>
                  </div>
                  <p className="text-xs text-ink-600 leading-relaxed">
                    Every machine categorized under <strong className="text-ink-900">{data.category.label}</strong>{" "}
                    follows the <strong className="text-ink-900">{freqLabel}</strong> maintenance frequency.
                    The scheduled PM starts from{" "}
                    <strong className="text-ink-900">
                      {data.category.defaultStartDate ? formatDate(data.category.defaultStartDate) : "the set start date"}
                    </strong>
                    , staggered across the annual maintenance master schedule so PM days never collide with
                    other categories.
                  </p>
                </div>

                {/* Health & Status Breakdown */}
                <div className="p-3.5 rounded-xl border border-line bg-surface space-y-3">
                  <span className="text-xs font-semibold text-ink-900">Equipment health distribution</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg border border-success-500/20 bg-success-500/5 text-center">
                      <span className="text-xs text-success-700 font-medium">Operational</span>
                      <p className="text-xl font-bold text-success-800 mt-1 tabular-nums">
                        {data.stats.workingCount}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg border border-danger-500/20 bg-danger-500/5 text-center">
                      <span className="text-xs text-danger-700 font-medium">Faulty / Down</span>
                      <p className="text-xl font-bold text-danger-800 mt-1 tabular-nums">
                        {data.stats.faultyCount}
                      </p>
                    </div>
                    <div className="p-2.5 rounded-lg border border-ink-200 bg-ink-50 text-center">
                      <span className="text-xs text-ink-500 font-medium">Decommissioned</span>
                      <p className="text-xl font-bold text-ink-700 mt-1 tabular-nums">
                        {data.stats.decommissionedCount}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Next PM Action */}
                <div className="p-3.5 rounded-xl border border-brand-200 bg-brand-50/50 flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-brand-900">Upcoming PM Batch</p>
                    <p className="text-xs text-brand-700">
                      Next scheduled service is due on{" "}
                      <strong>{data.nextDue.date ? formatDate(data.nextDue.date) : "record date"}</strong>.
                    </p>
                  </div>
                  <Link
                    href={`/schedule?filter=${encodeURIComponent(data.category.code)}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white hover:bg-brand-500 transition-colors shrink-0"
                  >
                    <span>View in schedule</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}

            {/* ── TAB 2: SAFETY & COMPLIANCE DOCUMENTS ──────────────────── */}
            {tab === "documents" && (
              <div className="space-y-4">
                {/* Standing Work Method Statement (WMS) */}
                <div className="border border-line rounded-xl overflow-hidden bg-surface">
                  <div className="px-3.5 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-brand-600" />
                      <span className="text-xs font-semibold text-ink-900">Standing Work Method Statements (WMS)</span>
                    </div>
                    <span className="text-xs text-ink-500">{data.documents.wms.length} registered</span>
                  </div>
                  {data.documents.wms.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-ink-500">No standing method statement registered for this category yet.</p>
                      <Link
                        href={`/wms?category=${encodeURIComponent(data.category.code)}`}
                        className="inline-block mt-1.5 text-xs text-brand-600 font-medium hover:underline"
                      >
                        Create standing WMS →
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-ink-100">
                      {data.documents.wms.map((doc) => (
                        <div key={doc.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink-900">{doc.wmsNumber}</span>
                              <Badge className="bg-brand-50 text-brand-700 border-brand-200">
                                Rev {doc.revision}
                              </Badge>
                              <span className="text-ink-400">· {doc.status}</span>
                            </div>
                            <p className="text-ink-600 truncate mt-0.5">{doc.title}</p>
                            {doc.preparedByName && (
                              <p className="text-xs text-ink-400 mt-0.5">Prepared by {doc.preparedByName}</p>
                            )}
                          </div>
                          <Link
                            href={`/wms/${doc.id}`}
                            className="text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5 shrink-0"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Job Hazard Analysis (JHA) */}
                <div className="border border-line rounded-xl overflow-hidden bg-surface">
                  <div className="px-3.5 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                      <span className="text-xs font-semibold text-ink-900">Job Hazard Analysis (JHA)</span>
                    </div>
                    <span className="text-xs text-ink-500">{data.documents.jha.length} registered</span>
                  </div>
                  {data.documents.jha.length === 0 ? (
                    <div className="p-4 text-center">
                      <p className="text-xs text-ink-500">No hazard analysis filed for this category.</p>
                      <Link
                        href={`/jha?category=${encodeURIComponent(data.category.code)}`}
                        className="inline-block mt-1.5 text-xs text-brand-600 font-medium hover:underline"
                      >
                        Raise JHA from approved WMS →
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-ink-100">
                      {data.documents.jha.map((doc) => (
                        <div key={doc.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink-900">{doc.jhaNumber}</span>
                              <Badge className="bg-brand-50 text-brand-700 border-brand-200">
                                Rev {doc.revision}
                              </Badge>
                              <span className="text-ink-400">· {doc.status}</span>
                            </div>
                            <p className="text-ink-600 truncate mt-0.5">{doc.title}</p>
                          </div>
                          <Link
                            href={`/jha/${doc.id}`}
                            className="text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5 shrink-0"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Permits to Work (PTW) */}
                <div className="border border-line rounded-xl overflow-hidden bg-surface">
                  <div className="px-3.5 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-900">Recent Permits to Work (PTW)</span>
                    <span className="text-xs text-ink-500">{data.documents.ptw.length} recent</span>
                  </div>
                  {data.documents.ptw.length === 0 ? (
                    <p className="p-4 text-center text-xs text-ink-500">No recent permits raised for this category.</p>
                  ) : (
                    <div className="divide-y divide-ink-100">
                      {data.documents.ptw.map((p) => (
                        <div key={p.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink-900">{p.permitNumber}</span>
                              <span className="text-ink-400">· {p.status}</span>
                            </div>
                            <p className="text-ink-600 truncate mt-0.5">{p.workDescription}</p>
                            {p.equipmentName && (
                              <p className="text-xs text-ink-400 mt-0.5">
                                {p.equipmentName} ({p.assetId})
                              </p>
                            )}
                          </div>
                          <Link
                            href={`/permits/${p.id}`}
                            className="text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5 shrink-0"
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
                <div className="border border-line rounded-xl overflow-hidden bg-surface">
                  <div className="px-3.5 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-900">Recent Work Orders (WO)</span>
                    <span className="text-xs text-ink-500">{data.documents.wo.length} recent</span>
                  </div>
                  {data.documents.wo.length === 0 ? (
                    <p className="p-4 text-center text-xs text-ink-500">No recent work orders found for this category.</p>
                  ) : (
                    <div className="divide-y divide-ink-100">
                      {data.documents.wo.map((w) => (
                        <div key={w.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink-900">{w.workOrderNumber}</span>
                              <span className="px-1.5 py-0.5 rounded bg-ink-100 font-medium text-ink-700">
                                {w.type}
                              </span>
                              <span className="text-ink-400">· {w.status}</span>
                            </div>
                            <p className="text-ink-600 truncate mt-0.5">{w.title}</p>
                          </div>
                          <Link
                            href={`/work-orders/${w.id}`}
                            className="text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5 shrink-0"
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

            {/* ── TAB 3: ACTIVITIES & PMs ────────────────────────────────── */}
            {tab === "activities" && (
              <div className="space-y-4">
                {/* Recent PM Batches */}
                <div className="border border-line rounded-xl overflow-hidden bg-surface">
                  <div className="px-3.5 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-900">Recent PM Batches</span>
                    <span className="text-xs text-ink-500">{data.recentActivities.batches.length} batches</span>
                  </div>
                  {data.recentActivities.batches.length === 0 ? (
                    <p className="p-4 text-center text-xs text-ink-500">No PM batches raised for this category yet.</p>
                  ) : (
                    <div className="divide-y divide-ink-100">
                      {data.recentActivities.batches.map((b) => (
                        <div key={b.id} className="p-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink-900">{b.batchNumber}</span>
                              <Badge className="bg-brand-50 text-brand-700 border-brand-200">
                                {b.status}
                              </Badge>
                            </div>
                            <p className="text-ink-600 truncate mt-0.5">{b.title}</p>
                            <p className="text-xs text-ink-400 mt-0.5">
                              Planned: {formatDate(b.plannedDate)}
                              {b.assignedToName ? ` · Assigned to ${b.assignedToName}` : ""}
                            </p>
                          </div>
                          <Link
                            href={`/pm-batches/${b.id}`}
                            className="text-brand-600 hover:text-brand-700 font-medium flex items-center gap-0.5 shrink-0"
                          >
                            <span>Open Batch</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pending PM Activities */}
                <div className="border border-line rounded-xl overflow-hidden bg-surface">
                  <div className="px-3.5 py-2.5 border-b border-line bg-canvas flex items-center justify-between">
                    <span className="text-xs font-semibold text-ink-900">Pending PM Schedule Items</span>
                    <span className="text-xs text-ink-500">{data.pendingPMs.count} pending</span>
                  </div>
                  {data.pendingPMs.items.length === 0 ? (
                    <p className="p-4 text-center text-xs text-ink-500">No pending PM activities for this category.</p>
                  ) : (
                    <div className="divide-y divide-ink-100 max-h-60 overflow-y-auto">
                      {data.pendingPMs.items.map((item) => (
                        <div key={item.id} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink-900">{item.equipmentName}</span>
                              <span className="text-xs text-ink-400">({item.assetId})</span>
                            </div>
                            <p className="text-xs text-ink-500 mt-0.5">
                              Due: {formatDate(item.plannedDate)} · Status: {item.status}
                              {item.responsiblePersonName ? ` · Lead: ${item.responsiblePersonName}` : ""}
                            </p>
                          </div>
                          {item.batchId ? (
                            <Link
                              href={`/pm-batches/${item.batchId}`}
                              className="text-xs text-brand-600 hover:underline shrink-0"
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

            {/* ── TAB 4: MACHINES ROSTER ─────────────────────────────────── */}
            {tab === "machines" && (
              <div className="border border-line rounded-xl overflow-hidden bg-surface">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line bg-canvas text-ink-500">
                      <th className="py-2 px-3 font-medium">Asset ID</th>
                      <th className="py-2 px-3 font-medium">Name</th>
                      <th className="py-2 px-3 font-medium">Status</th>
                      <th className="py-2 px-3 font-medium">Location</th>
                      <th className="py-2 px-3 font-medium text-right">Criticality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {data.machines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-ink-500">
                          No machines assigned to this category yet.
                        </td>
                      </tr>
                    ) : (
                      data.machines.map((m) => {
                        const isWorking = m.status === "OPERATIONAL";
                        return (
                          <tr key={m.id} className="hover:bg-ink-50 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-ink-900">
                              <Link
                                href={`/equipment/${m.assetId.replace(/\//g, "-")}`}
                                className="text-brand-600 hover:underline"
                              >
                                {m.assetId}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-ink-800 font-medium">{m.name}</td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
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
                            <td className="py-2.5 px-3 text-ink-600">{m.location || "—"}</td>
                            <td className="py-2.5 px-3 text-right">
                              {m.criticality ? (
                                <span className="px-1.5 py-0.5 rounded bg-ink-100 text-ink-700 font-semibold">
                                  {m.criticality}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-line flex items-center justify-between gap-3">
            <span className="text-xs text-ink-500">
              {data.stats.totalMachines} total equipment in category
            </span>
            <div className="flex items-center gap-2">
              {canPropose && onProposeChange && (
                <Button
                  variant="secondary"
                  icon={Pencil}
                  onClick={() => {
                    onClose();
                    onProposeChange();
                  }}
                >
                  Propose a change
                </Button>
              )}
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
