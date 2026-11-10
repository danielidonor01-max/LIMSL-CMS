// src/app/schedule/page.tsx
"use client";

import MetricPanel from "@/components/MetricPanel";
import { PAGE_MAIN } from "@/lib/page-shell";
import Tabs from "@/components/Tabs";
import DateField from "@/components/DateField";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useCategoryLabels } from "@/lib/use-category-labels";
import { useApi } from "@/lib/api-cache";
import { useSession } from "next-auth/react";
import {
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  Search,
  CalendarPlus,
  Users,
  Layers,
  CalendarClock,
  BellOff,
  PauseCircle,
  ClipboardList,
  SlidersHorizontal,
  X,
  CalendarCheck,
  FilterX,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import Field, { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import ScheduleCalendar from "@/components/ScheduleCalendar";
import KebabMenu from "@/components/KebabMenu";
import AssignPeople from "@/components/AssignPeople";
import { formatDate } from "@/lib/utils";
import { ROLE_LABELS, WORK_ASSIGN_ROLES, SCHEDULE_WRITE_ROLES, MAINTENANCE_WRITE_ROLES, canAccessPath } from "@/lib/roles";
import {
  ACTIVITY_TYPE_BADGE,
  ACTIVITY_TYPE_LABELS,
  SCHEDULE_STATUS_BADGE,
  SCHEDULE_STATUS_LABELS,
  WO_STATUS_LABELS,
  MONTH_NAMES,
  FREQUENCY_LABELS,
} from "@/lib/constants";
import { CalendarDays, List } from "lucide-react";
import LoadError from "@/components/LoadError";
import SegmentedControl from "@/components/SegmentedControl";

const FREQUENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "One-off (no recurrence)" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "BI_MONTHLY", label: "Bi-monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "SEMI_ANNUAL", label: "Semi-annual" },
  { value: "ANNUAL", label: "Annual" },
];

type ScheduleRow = {
  id: string;
  equipmentId: string;
  year: number;
  quarter: number | null;
  month: number | null;
  plannedDate: string;
  activityType: string;
  taskDescription: string | null;
  maintenanceFrequency: string | null;
  responsiblePersonName: string | null;
  responsiblePersonId: string | null;
  assistantIds: string | null;
  status: string;
  completedDate: string | null;
  workOrderId: string | null;
  workOrderNumber: string | null;
  workOrderStatus: string | null;
  equipmentName: string | null;
  assetId: string | null;
  category: string | null;
  batchId: string | null;
  batchNumber: string | null;
  batchStatus: string | null;
  criticality: string | null;
  location: string | null;
  deferredReason: string | null;
  deferredByName: string | null;
  deferredAt: string | null;
  deferredReviewDate: string | null;
};

const TODAY = new Date().toISOString().slice(0, 10);

// assistantIds is stored as JSON text. A malformed value must not take the page
// down, so it reads as "nobody else" rather than throwing.
const safeIds = (raw: string | null | undefined): string[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const emptyCreate = {
  equipmentId: "",
  plannedDate: "",
  activityType: "PM",
  maintenanceFrequency: "MONTHLY",
  taskDescription: "",
  responsiblePersonId: "",
  responsiblePersonName: "",
};

function SchedulePageView() {
  const router = useRouter();
  const { data: rowsData, loading, error, refresh } = useApi<ScheduleRow[]>("/api/schedule", []);
  // Names as the register holds them, including categories added in Settings.
  const EQUIPMENT_CATEGORY_LABELS = useCategoryLabels();
  const rows = Array.isArray(rowsData) ? rowsData : [];

  // The session resolves client-side only; anything role-dependent has to wait
  // past mount or the server HTML and the first paint disagree (AGENTS.md §7).
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Naming who does a job, and adding a job to the plan, are the same kind of
  // decision and belong to the same hands.
  const canAssign = mounted && WORK_ASSIGN_ROLES.includes(role ?? "");
  // Rescheduling, deferring and raising a work order are what the schedule
  // route accepts from MAINTENANCE_WRITE_ROLES. QA/QC and HSE were offered all
  // three and refused every time; a control that is always refused is worse
  // than no control.
  const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");
  const canSchedule = mounted && SCHEDULE_WRITE_ROLES.includes(role ?? "");
  const [tab, setTab] = useState<"upcoming" | "all" | "deferred">("upcoming");
  const [view, setView] = useState<"list" | "calendar">("list");
  // Arriving from a category page or a machine's menu, the URL names what to
  // narrow to, so the first screen is already the one they came for.
  const searchParams = useSearchParams();
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get("category") ?? "ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [quarterFilter, setQuarterFilter] = useState("ALL");

  const { data: equipmentData } = useApi<{ id: string; assetId: string; name: string }[]>(
    "/api/equipment",
    [],
  );
  const equipmentList = Array.isArray(equipmentData) ? equipmentData : [];
  const { data: staffData } = useApi<{ id: string; name: string; role: string }[]>("/api/users", []);
  const staff = Array.isArray(staffData) ? staffData : [];
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [saving, setSaving] = useState(false);
  // `group` moves every machine of the category on that day, not just the
  // row the menu happened to be opened from.
  const [reschedule, setReschedule] = useState<{ row: ScheduleRow; date: string; group?: boolean } | null>(null);
  const [defer, setDefer] = useState<{ row: ScheduleRow; reason: string; reviewDate: string; group?: boolean } | null>(
    null,
  );
  const [snooze, setSnooze] = useState<{ row: ScheduleRow; reason: string; until: string } | null>(null);
  const [assign, setAssign] = useState<ScheduleRow | null>(null);
  const [tableMode, setTableMode] = useState<"category" | "individual">("category");
  const [viewingCategoryGroup, setViewingCategoryGroup] = useState<CategoryGroup | null>(null);

  const raiseBatch = async (r: ScheduleRow) => {
    if (!r.category) {
      toast.error("This activity has no equipment category, so it cannot be batched.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/pm-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: r.category, plannedDate: r.plannedDate }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not raise the batch.");
        return;
      }
      toast.success(
        `${d.batchNumber} raised, covering ${d.machineCount} machine${d.machineCount === 1 ? "" : "s"}.`,
      );
      router.push(`/pm-batches/${d.id}`);
    } catch {
      toast.error("Could not raise the batch.");
    } finally {
      setSaving(false);
    }
  };

  const submitAssign = async (next: { leadId: string; leadName: string; assistantIds: string[] }) => {
    if (!assign) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/schedule/${assign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsiblePersonId: next.leadId || null,
          responsiblePersonName: next.leadName || null,
          assistantIds: next.assistantIds,
          applyToCategory: true,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not save the assignment.");
        return;
      }
      const who = `${next.leadName}${next.assistantIds.length ? ` with ${next.assistantIds.length} other(s)` : ""}`;
      toast.success(
        !next.leadId
          ? "Left unassigned. Only managers will be reminded."
          : d.batch?.raised
            ? `Assigned to ${who}. ${d.batch.batchNumber} raised with ${d.batch.workOrders} work order${d.batch.workOrders === 1 ? "" : "s"}; work starts once its WMS, JHA and permit are approved.`
            : d.batch
              ? `Assigned to ${who} on ${d.batch.batchNumber}.`
              : `Assigned to ${who}.`,
      );
      setAssign(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const submitSnooze = async () => {
    if (!snooze) return;
    setSaving(true);
    try {
      const res = await fetch("/api/escalations/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "SCHEDULE",
          entityId: snooze.row.id,
          reason: snooze.reason,
          until: snooze.until,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not quieten the reminders.");
        return;
      }
      toast.success(`Reminders paused until ${formatDate(d.until)}. The activity is still overdue.`);
      setSnooze(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const load = () => {
    refresh();
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.equipmentId || !createForm.plannedDate) {
      toast.error("Pick the equipment and a planned date.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to schedule activity.");
        return;
      }
      toast.success(
        d.movedFromWeekend
          ? `Scheduled for ${formatDate(d.plannedDate)}. ${formatDate(d.movedFromWeekend)} is a weekend, so it moved to the next working day.`
          : "Activity scheduled.",
      );
      setShowCreate(false);
      setCreateForm(emptyCreate);
      load();
    } catch {
      toast.error("Failed to schedule activity.");
    } finally {
      setSaving(false);
    }
  };

  const submitReschedule = async () => {
    if (!reschedule) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/schedule/${reschedule.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannedDate: reschedule.date, applyToCategory: reschedule.group === true }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to reschedule.");
        return;
      }
      toast.success(
        d.movedFromWeekend
          ? `Rescheduled to ${formatDate(d.plannedDate)}. ${formatDate(d.movedFromWeekend)} is a weekend, so it moved to the next working day.`
          : "Activity rescheduled.",
      );
      setReschedule(null);
      load();
    } catch {
      toast.error("Failed to reschedule.");
    } finally {
      setSaving(false);
    }
  };

  const submitDefer = async () => {
    if (!defer) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/schedule/${defer.row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "defer",
          deferredReason: defer.reason,
          deferredReviewDate: defer.reviewDate,
          applyToCategory: defer.group === true,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to defer.");
        return;
      }
      toast.success("Deferral recorded against your name. It returns to overdue on the review date.");
      setDefer(null);
      load();
    } catch {
      toast.error("Failed to defer.");
    } finally {
      setSaving(false);
    }
  };

  // ── KPI summary (PM only) ──────────────────────────────────────────────
  const summary = useMemo(() => {
    const pm = rows.filter((r) => r.activityType === "PM");
    const duePM = pm.filter((r) => r.plannedDate <= TODAY);
    const completed = pm.filter((r) => r.status === "COMPLETED").length;
    const overdue = rows.filter((r) => r.status === "OVERDUE").length;
    const upcoming = rows.filter(
      (r) => r.status === "SCHEDULED" && r.plannedDate >= TODAY,
    ).length;
    const compliance = duePM.length
      ? Math.round((duePM.filter((r) => r.status === "COMPLETED").length / duePM.length) * 100)
      : 0;
    return { compliance, overdue, upcoming, completed };
  }, [rows]);

  // Five controls of three different colours used to sit in this cell, and
  // which of them appeared depended on the row's status, so the column changed
  // shape line by line. The register and the work-order list put row actions
  // behind one kebab; this does too.
  //
  // The work order goes in the menu rather than beside it, because it is
  // reached the same way everything else here is. What the row still SAYS,
  // in its own column, is whether one exists.

  const rowActions = (r: ScheduleRow, group = false) => [
    // Assigning names who carries the job. A technician may raise a work
    // order, move a date and record a deferral, but not put somebody else's
    // name on the work — the route refuses it either way, and a control that
    // is always refused is worse than no control.
    ...(canAssign && r.status !== "COMPLETED"
      ? [{ label: "Assign people", icon: Users, onClick: () => setAssign(r) }]
      : []),
    ...(canWrite && r.status !== "COMPLETED"
      ? [
          {
            label: group ? "Reschedule all" : "Reschedule",
            icon: CalendarClock,
            onClick: () => setReschedule({ row: r, date: r.plannedDate, group }),
          },
        ]
      : []),
    ...(canWrite && r.status === "OVERDUE"
      ? [
          {
            label: "Quieten reminders",
            icon: BellOff,
            onClick: () =>
              setSnooze({
                row: r,
                reason: "",
                until: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
              }),
          },
        ]
      : []),
    ...(canWrite && r.status !== "COMPLETED" && r.status !== "DEFERRED"
      ? [
          {
            label: "Defer with a reason",
            icon: PauseCircle,
            onClick: () =>
              setDefer({
                row: r,
                reason: "",
                reviewDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
                group,
              }),
          },
        ]
      : []),
    ...(canAssign &&
    !r.batchId &&
    r.status !== "COMPLETED" &&
    (r.activityType === "PM" || r.activityType === "INS")
      ? [
          {
            label: "Raise PM batch",
            icon: Layers,
            onClick: () => raiseBatch(r),
          },
        ]
      : []),
    ...(r.batchId
      ? [{ label: "Open the PM batch", icon: Layers, href: `/pm-batches/${r.batchId}` }]
      : []),
    ...(r.workOrderId
      ? [
          {
            label: r.workOrderNumber ? `Open ${r.workOrderNumber}` : "Open the work order",
            icon: ClipboardList,
            href: `/work-orders/${r.workOrderId}`,
          },
        ]
      : // A category's machines go through one batch, not a work order each.
        canWrite && !group
        ? [{ label: "Raise a work order", icon: Plus, href: `/work-orders/new?scheduleId=${r.id}` }]
        : []),
  ];

  // The modal's kebab: the category page, then the row actions minus the two
  // the modal already shows as its main button (assign, open batch). Reassign
  // stays here because once a batch exists the main button is the batch.
  const groupModalActions = (g: CategoryGroup) => [
    ...(canAccessPath(role, "/asset-categories") && g.category
      ? [{ label: "Category page", icon: Layers, href: `/asset-categories/${encodeURIComponent(g.category)}` }]
      : []),
    ...(canAssign && g.batchId && g.status !== "COMPLETED"
      ? [{ label: "Reassign", icon: Users, onClick: () => { setViewingCategoryGroup(null); setAssign(g.firstRow); } }]
      : []),
    ...rowActions(g.firstRow, true).filter((i) => i.label !== "Assign people" && i.label !== "Open the PM batch"),
  ];

  const filtered = useMemo(() => {
    let out = rows;
    if (tab === "upcoming") {
      const in60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
      out = out.filter(
        (r) => r.status !== "COMPLETED" && r.plannedDate >= TODAY && r.plannedDate <= in60,
      );
      out = [...out].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    } else if (tab === "deferred") {
      out = out.filter((r) => r.status === "DEFERRED");
      out = [...out].sort((a, b) => (a.deferredReviewDate ?? "").localeCompare(b.deferredReviewDate ?? ""));
    } else {
      out = [...out].sort((a, b) => b.plannedDate.localeCompare(a.plannedDate));
    }
    if (categoryFilter !== "ALL") out = out.filter((r) => r.category === categoryFilter);
    if (typeFilter !== "ALL") out = out.filter((r) => r.activityType === typeFilter);
    if (statusFilter !== "ALL") out = out.filter((r) => r.status === statusFilter);
    if (quarterFilter !== "ALL") out = out.filter((r) => String(r.quarter) === quarterFilter);
    if (q.trim()) {
      const term = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.equipmentName?.toLowerCase().includes(term) ||
          r.assetId?.toLowerCase().includes(term) ||
          r.responsiblePersonName?.toLowerCase().includes(term) ||
          (r.category ? (EQUIPMENT_CATEGORY_LABELS[r.category] ?? r.category).toLowerCase().includes(term) : false),
      );
    }
    return out;
  }, [rows, tab, categoryFilter, typeFilter, statusFilter, quarterFilter, q, EQUIPMENT_CATEGORY_LABELS]);

  const deferredCount = rows.filter((r) => r.status === "DEFERRED").length;

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.category).filter((c): c is string => Boolean(c))))
        .map((code) => [code, EQUIPMENT_CATEGORY_LABELS[code] ?? code] as const)
        .sort((x, y) => x[1].localeCompare(y[1])),
    [rows, EQUIPMENT_CATEGORY_LABELS],
  );

  // Each narrowing filter that is on, as a chip that turns it off. Search is
  // not one: its box already shows what it holds.
  const activeFilters = [
    categoryFilter !== "ALL" && {
      key: "category",
      label: EQUIPMENT_CATEGORY_LABELS[categoryFilter] ?? categoryFilter,
      clear: () => setCategoryFilter("ALL"),
    },
    typeFilter !== "ALL" && {
      key: "type",
      label: ACTIVITY_TYPE_LABELS[typeFilter] ?? typeFilter,
      clear: () => setTypeFilter("ALL"),
    },
    statusFilter !== "ALL" && {
      key: "status",
      label: SCHEDULE_STATUS_LABELS[statusFilter] ?? statusFilter,
      clear: () => setStatusFilter("ALL"),
    },
    quarterFilter !== "ALL" && { key: "quarter", label: `Q${quarterFilter}`, clear: () => setQuarterFilter("ALL") },
  ].filter((f): f is { key: string; label: string; clear: () => void } => Boolean(f));

  const filtersActive = q.trim() !== "" || activeFilters.length > 0;
  const clearNarrowing = () => {
    setCategoryFilter("ALL");
    setTypeFilter("ALL");
    setStatusFilter("ALL");
    setQuarterFilter("ALL");
  };
  const clearFilters = () => {
    setQ("");
    clearNarrowing();
  };

  type CategoryGroup = {
    key: string;
    plannedDate: string;
    month: number | null;
    quarter: number | null;
    category: string | null;
    categoryLabel: string;
    activityType: string;
    maintenanceFrequency: string | null;
    responsiblePersonName: string | null;
    assistantIds: string | null;
    status: string;
    batchId: string | null;
    batchNumber: string | null;
    batchStatus: string | null;
    firstRow: ScheduleRow;
    rows: ScheduleRow[];
  };

  const categoryGroups = useMemo(() => {
    const map = new Map<string, CategoryGroup>();
    for (const r of filtered) {
      const catKey = r.category ? `${r.plannedDate}::${r.activityType}::${r.category}` : `ROW::${r.id}`;
      if (!map.has(catKey)) {
        map.set(catKey, {
          key: catKey,
          plannedDate: r.plannedDate,
          month: r.month,
          quarter: r.quarter,
          category: r.category,
          categoryLabel: r.category ? (EQUIPMENT_CATEGORY_LABELS[r.category] ?? r.category) : (r.equipmentName ?? "Individual Equipment"),
          activityType: r.activityType,
          maintenanceFrequency: r.maintenanceFrequency,
          responsiblePersonName: r.responsiblePersonName,
          assistantIds: r.assistantIds,
          status: r.status,
          batchId: r.batchId,
          batchNumber: r.batchNumber,
          batchStatus: r.batchStatus,
          firstRow: r,
          rows: [],
        });
      }
      const g = map.get(catKey)!;
      g.rows.push(r);
      if (!g.batchId && r.batchId) {
        g.batchId = r.batchId;
        g.batchNumber = r.batchNumber;
        g.batchStatus = r.batchStatus;
      }
      if (r.status === "OVERDUE" || r.status === "MISSED") g.status = "OVERDUE";
    }
    return Array.from(map.values());
  }, [filtered, EQUIPMENT_CATEGORY_LABELS]);

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Annual Maintenance Schedule"
          subtitle={`Planned preventive work for ${new Date().getFullYear()}, with due dates and adherence`}
          code="LIMSL-MAIN-PLN-013"
          actions={
            <>
              <SegmentedControl
                ariaLabel="Schedule view"
                value={view}
                onChange={setView}
                options={[
                  { value: "list" as const, label: "List", icon: List },
                  { value: "calendar" as const, label: "Calendar", icon: CalendarDays },
                ]}
              />
              {canSchedule && (
                <Button
                  variant="secondary"
                  icon={CalendarPlus}
                  onClick={() => {
                    setCreateForm({
                      ...emptyCreate,
                      activityType: role === "HSE" ? "INS" : "PM",
                      taskDescription: role === "HSE" ? "Periodic Safety & Environmental Inspection" : "",
                    });
                    setShowCreate(true);
                  }}
                >
                  {role === "HSE" ? "Schedule Inspection" : "Schedule PM"}
                </Button>
              )}
              <Button href="/work-orders/new" icon={Plus}>
                New Work Order
              </Button>
            </>
          }
        />

        {/* Summary */}
        <MetricPanel
          label="Schedule health"
          metrics={[
            {
              // A percentage is a scale, not a count, so the zero rule does not
              // apply: 0% compliance is exactly the case worth colouring.
              key: "compliance",
              label: "PM compliance",
              value: `${summary.compliance}%`,
              target: "95%",
              status: summary.compliance >= 95 ? "plain" : summary.compliance >= 50 ? "warning" : "danger",
              icon: ShieldCheck,
              description: "Completed against due, this year",
            },
            {
              key: "overdue",
              label: "Overdue",
              count: summary.overdue,
              value: String(summary.overdue),
              status: "danger",
              icon: AlertTriangle,
              description: "Past their planned date",
            },
            {
              key: "upcoming",
              label: "Upcoming",
              count: summary.upcoming,
              value: String(summary.upcoming),
              status: "plain",
              icon: Clock,
              description: "Scheduled and still ahead",
            },
            {
              key: "completed",
              label: "Completed",
              count: summary.completed,
              value: String(summary.completed),
              status: "plain",
              icon: CheckCircle2,
              description: "Signed off this year",
            },
          ]}
        />

        {view === "calendar" && <ScheduleCalendar rows={rows} canRaiseBatch={canAssign} />}

        {view === "list" && (
        <>
        {/* The time window decides what the table is about, so it leads. How
            rows are grouped is a setting of the same table and sits at the end
            of the same line. Search and the narrowing filters belong to the
            table and live on it, below, where they were crowding this row. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between border-b border-line">
          <Tabs
            ariaLabel="Filter scheduled activities"
            value={tab}
            onChange={setTab}
            items={[
              { value: "upcoming", label: "Upcoming, 60 days" },
              { value: "all", label: "All activities" },
              { value: "deferred", label: "Deferred", count: deferredCount || undefined },
            ]}
          />
          <div className="pb-2 shrink-0">
            <SegmentedControl
              ariaLabel="Schedule view grouping"
              value={tableMode}
              onChange={setTableMode}
              options={[
                { value: "category", label: "By category" },
                { value: "individual", label: "By machine" },
              ]}
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line">
            <div className="relative flex-1 min-w-[12rem] max-w-md">
              <Search className="w-4 h-4 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search the schedule"
                placeholder="Search machine, tag, category or person"
                className="w-full h-9 pl-8 pr-3 bg-canvas border border-line rounded-lg text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/15"
              />
            </div>
            <FilterPopover activeCount={activeFilters.length} onClear={clearNarrowing}>
              <FilterField label="Category" value={categoryFilter} onChange={setCategoryFilter}>
                <option value="ALL">All categories</option>
                {categoryOptions.map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </FilterField>
              <FilterField label="Type" value={typeFilter} onChange={setTypeFilter}>
                <option value="ALL">All types</option>
                {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </FilterField>
              <FilterField label="Status" value={statusFilter} onChange={setStatusFilter}>
                <option value="ALL">All statuses</option>
                {Object.entries(SCHEDULE_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </FilterField>
              <FilterField label="Quarter" value={quarterFilter} onChange={setQuarterFilter}>
                <option value="ALL">All quarters</option>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </FilterField>
            </FilterPopover>
            {activeFilters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={f.clear}
                aria-label={`Remove filter ${f.label}`}
                className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-brand-50 border border-brand-200 text-xs font-medium text-brand-700 hover:bg-brand-100 transition-colors"
              >
                {f.label}
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ))}
            {!loading && (
              <span className="ml-auto text-xs text-ink-500 tabular-nums whitespace-nowrap" aria-live="polite">
                {tableMode === "category"
                  ? `${categoryGroups.length} group${categoryGroups.length === 1 ? "" : "s"}, ${filtered.length} machine${filtered.length === 1 ? "" : "s"}`
                  : `${filtered.length} activit${filtered.length === 1 ? "y" : "ies"}`}
              </span>
            )}
          </div>
          {error && !loading ? (
            <LoadError what="the maintenance schedule" onRetry={refresh} />
          ) : loading ? (
            <TableSkeleton rows={7} cols={8} />
          ) : filtered.length === 0 ? (
            filtersActive ? (
              <EmptyState
                icon={FilterX}
                title="No activities match these filters"
                message={
                  tab === "upcoming"
                    ? "Nothing in the next 60 days matches the current search and filters."
                    : "No scheduled activity matches the current search and filters."
                }
                actionLabel="Clear filters"
                onAction={clearFilters}
              />
            ) : tab === "deferred" ? (
              <EmptyState
                icon={CalendarCheck}
                title="Nothing is being deferred"
                message="Nothing has been deferred. When work has to wait, defer it here rather than letting it run overdue."
                actionLabel="View all activities"
                onAction={() => setTab("all")}
              />
            ) : tab === "upcoming" ? (
              <EmptyState
                icon={CalendarCheck}
                title="Nothing due in the next 60 days"
                message="No preventive activity falls inside the next 60 days. Switch to All Activities to see the rest of the plan."
                actionLabel="Schedule PM"
                onAction={() => setShowCreate(true)}
                secondaryLabel="View all activities"
                onSecondary={() => setTab("all")}
              />
            ) : (
              <EmptyState
                icon={CalendarPlus}
                title="No maintenance scheduled"
                message="The annual plan is empty. Schedule preventive maintenance against a machine to start building it."
                actionLabel="Schedule PM"
                onAction={() => setShowCreate(true)}
              />
            )
          ) : tableMode === "category" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Planned</th>
                    <th className="py-3.5 px-5 font-medium">Category & Equipment Coverage</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Activity</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Freq.</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Assigned to</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Status</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">PM Batch</th>
                    <th className="py-3.5 px-5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {categoryGroups.map((g) => (
                    <tr key={g.key} className="hover:bg-ink-50">
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="tabular-nums text-ink-900">{formatDate(g.plannedDate)}</div>
                        <div className="text-xs text-ink-500">
                          {g.month ? MONTH_NAMES[g.month - 1] : ""} · Q{g.quarter}
                        </div>
                      </td>
                      {/* The category is the row's name, and the name opens it,
                          the way every other register here works. The count
                          and the first tags under it say what is inside
                          without a pill and two icons around a number. */}
                      <td className="py-3.5 px-5 max-w-0 w-full">
                        <button
                          type="button"
                          onClick={() => setViewingCategoryGroup(g)}
                          className="block max-w-full text-left group/cov"
                        >
                          <span className="block font-semibold text-ink-900 truncate group-hover/cov:text-brand-700 group-hover/cov:underline underline-offset-2">
                            {g.categoryLabel}
                          </span>
                          <span className="block text-xs text-ink-500 truncate mt-0.5">
                            {g.rows.length} machine{g.rows.length === 1 ? "" : "s"}
                            {" · "}
                            {g.rows
                              .slice(0, 3)
                              .map((r) => r.assetId ?? r.equipmentName)
                              .filter(Boolean)
                              .join(", ")}
                            {g.rows.length > 3 ? ` +${g.rows.length - 3}` : ""}
                          </span>
                        </button>
                      </td>
                      <td className="py-3.5 px-5">
                        <Badge className={ACTIVITY_TYPE_BADGE[g.activityType]}>
                          {g.activityType}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-5 text-ink-500">
                        {FREQUENCY_LABELS[g.maintenanceFrequency ?? ""] ?? g.maintenanceFrequency ?? "-"}
                      </td>
                      <td className="py-3.5 px-5 text-ink-700">
                        {g.responsiblePersonName ?? <span className="text-ink-400">Not assigned</span>}
                        {safeIds(g.assistantIds).length > 0 && (
                          <span className="text-ink-400"> +{safeIds(g.assistantIds).length}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        <Badge className={SCHEDULE_STATUS_BADGE[g.status]}>
                          {SCHEDULE_STATUS_LABELS[g.status] ?? g.status}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        {g.batchId ? (
                          <Link
                            href={`/pm-batches/${g.batchId}`}
                            className="text-brand-700 font-semibold hover:underline"
                          >
                            Open batch
                          </Link>
                        ) : canAssign && g.category && (g.activityType === "PM" || g.activityType === "INS") ? (
                          <button
                            onClick={() => raiseBatch(g.firstRow)}
                            disabled={saving}
                            className="text-xs text-brand-600 hover:underline font-semibold"
                          >
                            Raise PM batch
                          </button>
                        ) : (
                          <span className="text-ink-400">Not batched</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <KebabMenu
                          ariaLabel={`Actions for ${g.categoryLabel} on ${g.plannedDate}`}
                          items={[
                            { label: "View machines", icon: Layers, onClick: () => setViewingCategoryGroup(g) },
                            ...rowActions(g.firstRow, true),
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-ink-200 text-ink-500">
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Planned</th>
                    <th className="py-3.5 px-5 font-medium">Equipment</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Activity</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Freq.</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Assigned to</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Status</th>
                    <th className="py-3.5 px-5 font-medium whitespace-nowrap">Work order</th>
                    <th className="py-3.5 px-5 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-ink-50">
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="tabular-nums text-ink-900">{formatDate(r.plannedDate)}</div>
                        <div className="text-xs text-ink-500">
                          {r.month ? MONTH_NAMES[r.month - 1] : ""} · Q{r.quarter}
                        </div>
                      </td>
                      {/* The one column with unbounded content, so the one
                          that takes the slack. */}
                      <td className="py-3.5 px-5 max-w-0 w-full">
                        <div className="font-medium text-ink-900 truncate">
                          {r.equipmentName}
                        </div>
                        <div className="text-xs text-ink-500">
                          {r.assetId ? (
                            <Link
                              href={`/equipment/${r.assetId.replace(/\//g, "-")}`}
                              className="hover:text-brand-600 hover:underline"
                            >
                              {r.assetId}
                            </Link>
                          ) : null}
                          {" · "}
                          {r.category ? EQUIPMENT_CATEGORY_LABELS[r.category] : ""}
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <Badge className={ACTIVITY_TYPE_BADGE[r.activityType]}>
                          {r.activityType}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-5 text-ink-500">
                        {FREQUENCY_LABELS[r.maintenanceFrequency ?? ""] ?? r.maintenanceFrequency ?? "-"}
                      </td>
                      <td className="py-3.5 px-5 text-ink-700">
                        {r.responsiblePersonName ?? <span className="text-ink-400">Not assigned</span>}
                        {safeIds(r.assistantIds).length > 0 && (
                          <span className="text-ink-400"> +{safeIds(r.assistantIds).length}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5">
                        <Badge className={SCHEDULE_STATUS_BADGE[r.status]}>
                          {SCHEDULE_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                        {r.status === "DEFERRED" && (
                          <div className="mt-1.5 max-w-[220px] text-xs leading-relaxed text-ink-500">
                            <span className="text-violet-700 font-medium">
                              {r.deferredByName ?? "-"}
                            </span>
                            {r.deferredReviewDate ? ` · review ${formatDate(r.deferredReviewDate)}` : ""}
                            {r.deferredReason ? <div className="text-ink-500">{r.deferredReason}</div> : null}
                          </div>
                        )}
                      </td>
                      {/* Whether this PM has been discharged by a work order is
                          a FACT about the row, not something you do to it, so
                          it reads in its own column while the actions sit
                          behind the menu. */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        {r.workOrderId ? (
                          <Link
                            href={`/work-orders/${r.workOrderId}`}
                            className="text-brand-700 font-medium hover:underline"
                            title={
                              r.workOrderStatus
                                ? `Work order is ${WO_STATUS_LABELS[r.workOrderStatus] ?? r.workOrderStatus}`
                                : undefined
                            }
                          >
                            {r.workOrderNumber ?? "View"}
                          </Link>
                        ) : (
                          <span className="text-ink-400">Not raised</span>
                        )}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="flex justify-end">
                          <KebabMenu
                            ariaLabel={`Actions for ${r.equipmentName ?? "this activity"} on ${r.plannedDate}`}
                            items={rowActions(r)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-ink-500">
          Showing {filtered.length} of {rows.length} scheduled activities.
        </p>
        </>
        )}

        {/* Schedule a new activity */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Schedule Maintenance Activity" subtitle="Recurring activities regenerate automatically on completion">
          <form onSubmit={submitCreate} className="space-y-4">
            <Field label="Equipment" required>
              <Select
                value={createForm.equipmentId}
                onChange={(v) => setCreateForm((f) => ({ ...f, equipmentId: v }))}
                className="w-full"
                required
              >
                <option value="">Select equipment…</option>
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.assetId}, {eq.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Planned date" htmlFor="schedule-planned-date" required>
                <DateField value={createForm.plannedDate} onChange={(v) => setCreateForm((f) => ({ ...f, plannedDate: v }))} id="schedule-planned-date" required />
              </Field>
              <Field label="Activity type">
                <Select
                  value={createForm.activityType}
                  onChange={(v) => setCreateForm((f) => ({ ...f, activityType: v }))}
                  className="w-full"
                >
                  {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Frequency">
              <Select
                value={createForm.maintenanceFrequency}
                onChange={(v) => setCreateForm((f) => ({ ...f, maintenanceFrequency: v }))}
                className="w-full"
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Task description" htmlFor="schedule-task">
              <input
                id="schedule-task"
                type="text"
                value={createForm.taskDescription}
                onChange={(e) => setCreateForm((f) => ({ ...f, taskDescription: e.target.value }))}
                placeholder="e.g. Monthly lubrication & belt inspection"
                className={FIELD_CLASS}
              />
            </Field>
            <div>
              <label className={LABEL_CLASS}>Responsible person</label>
              {/* This was a free-text box, and escalations.ts skips any activity
                  with no responsiblePersonId, so every per-person reminder was
                  silently dropped and only the role broadcasts ever fired. A
                  typed name also drifts: "Musa", "musa a." and "Musa Abubakar"
                  are three different people to the system. */}
              <Select
                value={createForm.responsiblePersonId}
                onChange={(v) => {
                  const u = staff.find((x) => x.id === v);
                  setCreateForm((f) => ({
                    ...f,
                    responsiblePersonId: v,
                    responsiblePersonName: u?.name ?? "",
                  }));
                }}
                className="w-full"
              >
                <option value="">Unassigned, nobody will be reminded</option>
                {staff.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABELS[u.role] ?? u.role}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-ink-500 mt-1">
                Overdue and due-soon reminders go to this person directly. Leaving it unassigned means only the
                managers hear about it.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" loading={saving} icon={CalendarPlus}>Schedule</Button>
            </div>
          </form>
        </Modal>

        {/* Reschedule an activity */}
        <Modal open={!!reschedule} onClose={() => setReschedule(null)} title="Reschedule Activity" subtitle={reschedule ? `${reschedule.group && reschedule.row.category ? `Every ${EQUIPMENT_CATEGORY_LABELS[reschedule.row.category] ?? reschedule.row.category} machine on this day` : reschedule.row.assetId ?? ""} · ${reschedule.row.activityType}` : ""}>
          {reschedule && (
            <div className="space-y-4">
              <p className="text-xs text-ink-500">
                Currently planned for <span className="tabular-nums text-ink-700">{formatDate(reschedule.row.plannedDate)}</span>.
              </p>
              <Field label="New planned date" htmlFor="schedule-new-date">
                <DateField value={reschedule.date} onChange={(v) => setReschedule((r) => (r ? { ...r, date: v } : r))} min={new Date().toISOString().slice(0, 10)} id="schedule-new-date" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setReschedule(null)}>Cancel</Button>
                <Button type="button" loading={saving} onClick={submitReschedule}>Reschedule</Button>
              </div>
            </div>
          )}
        </Modal>

        <AssignPeople
          open={!!assign}
          onClose={() => setAssign(null)}
          people={staff}
          leadId={assign?.responsiblePersonId ?? null}
          assistantIds={safeIds(assign?.assistantIds)}
          title="Who is doing this job"
          subtitle={assign ? `${assign.assetId ?? ""} · ${ACTIVITY_TYPE_LABELS[assign.activityType] ?? assign.activityType}` : ""}
          saving={saving}
          onSave={submitAssign}
        />

        {/* Quieten reminders, NOT a deferral. The work is still overdue and
            still counts; this only stops the daily nagging of someone who is
            already dealing with it. */}
        <Modal
          open={!!snooze}
          onClose={() => setSnooze(null)}
          title="Quieten reminders"
          subtitle={snooze ? `${snooze.row.assetId ?? ""} · ${ACTIVITY_TYPE_LABELS[snooze.row.activityType] ?? snooze.row.activityType}` : ""}
        >
          {snooze && (
            <div className="space-y-4">
              <p className="text-xs text-ink-600 leading-relaxed">
                This activity <strong>stays overdue</strong> and still counts against PM compliance. All this does is
                stop the daily reminder while you deal with it. If you want it formally put off, use{" "}
                <strong>Defer</strong> instead, that records a risk accepted and needs a review date.
              </p>
              <Field label="What is being done about it" htmlFor="sn-reason">
                <input
                  id="sn-reason"
                  value={snooze.reason}
                  onChange={(e) => setSnooze((s) => (s ? { ...s, reason: e.target.value } : s))}
                  placeholder="e.g. Bearing on order, ETA 3 weeks, inspected weekly meanwhile"
                  className={FIELD_CLASS}
                />
              </Field>
              <Field label="Remind me again on" htmlFor="sn-until">
                <DateField value={snooze.until} onChange={(v) => setSnooze((s) => (s ? { ...s, until: v } : s))} min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} id="sn-until" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setSnooze(null)}>Cancel</Button>
                <Button type="button" loading={saving} onClick={submitSnooze}>Quieten</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* Deferral, a recorded, owned, time-boxed risk acceptance */}
        <Modal
          open={!!defer}
          onClose={() => setDefer(null)}
          title="Defer this activity"
          subtitle={defer ? `${defer.group && defer.row.category ? `Every ${EQUIPMENT_CATEGORY_LABELS[defer.row.category] ?? defer.row.category} machine on this day` : defer.row.assetId ?? ""} · ${ACTIVITY_TYPE_LABELS[defer.row.activityType] ?? defer.row.activityType}` : ""}
        >
          {defer && (
            <div className="space-y-4">
              <p className="text-xs text-ink-500">
                Planned for <span className="tabular-nums text-ink-700">{formatDate(defer.row.plannedDate)}</span>.
                Deferring records a risk you are accepting, against your name. It does not close the
                activity, on the review date it returns to the overdue list.
              </p>
              <Field label="Reason and risk accepted" htmlFor="defer-reason">
                <textarea
                  id="defer-reason"
                  rows={3}
                  value={defer.reason}
                  onChange={(e) => setDefer((d) => (d ? { ...d, reason: e.target.value } : d))}
                  placeholder="e.g. Spare bearing on order, ETA 3 weeks. Machine derated to 60% and inspected weekly in the interim."
                  className={`${FIELD_CLASS} resize-none`}
                />
              </Field>
              <Field label="Review date" htmlFor="defer-review">
                <DateField value={defer.reviewDate} onChange={(v) => setDefer((d) => (d ? { ...d, reviewDate: v } : d))} min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} id="defer-review" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setDefer(null)}>Cancel</Button>
                <Button type="button" loading={saving} onClick={submitDefer}>Record deferral</Button>
              </div>
            </div>
          )}
        </Modal>

        {/* One category, one day, read top to bottom in the order it is
            needed: when and how it stands, the one thing to do next, then the
            machines it covers. Nobody is named against a plan row ahead of
            time (staff change), so "who" appears only once it is assigned, and
            assigning is what raises the batch. Everything else sits in the
            kebab beside the close button. */}
        <Modal
          open={!!viewingCategoryGroup}
          onClose={() => setViewingCategoryGroup(null)}
          title={viewingCategoryGroup?.categoryLabel ?? "Category"}
          subtitle={
            viewingCategoryGroup
              ? `${ACTIVITY_TYPE_LABELS[viewingCategoryGroup.activityType] ?? viewingCategoryGroup.activityType} · ${formatDate(viewingCategoryGroup.plannedDate)}`
              : ""
          }
          headerActions={
            viewingCategoryGroup ? (
              <KebabMenu
                ariaLabel={`More actions for ${viewingCategoryGroup.categoryLabel}`}
                items={groupModalActions(viewingCategoryGroup)}
              />
            ) : undefined
          }
        >
          {viewingCategoryGroup &&
            (() => {
              const g = viewingCategoryGroup;
              const helpers = safeIds(g.assistantIds).length;
              const batchable = !!g.category && (g.activityType === "PM" || g.activityType === "INS");
              const days = Math.round(
                (new Date(`${g.plannedDate}T00:00:00`).getTime() - new Date(`${TODAY}T00:00:00`).getTime()) / 864e5,
              );
              const when =
                g.status === "COMPLETED"
                  ? null
                  : days === 0
                    ? "Due today"
                    : days > 0
                      ? `Due in ${days} day${days === 1 ? "" : "s"}`
                      : `${-days} day${days === -1 ? "" : "s"} overdue`;
              return (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                    <Badge className={SCHEDULE_STATUS_BADGE[g.status]}>
                      {SCHEDULE_STATUS_LABELS[g.status] ?? g.status}
                    </Badge>
                    {when && (
                      <span className={days < 0 ? "text-danger-700 font-medium" : "text-ink-700"}>{when}</span>
                    )}
                    {g.maintenanceFrequency && (
                      <span className="text-ink-500">
                        {FREQUENCY_LABELS[g.maintenanceFrequency] ?? g.maintenanceFrequency}
                      </span>
                    )}
                  </div>

                  {g.status !== "COMPLETED" && (
                    <section
                      aria-label="Next step"
                      className="rounded-lg border border-line bg-canvas p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
                    >
                      {g.batchId ? (
                        <>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink-900">
                              {g.responsiblePersonName ? `Assigned to ${g.responsiblePersonName}` : "Batch raised, not assigned"}
                              {helpers > 0 && <span className="font-normal text-ink-500"> +{helpers}</span>}
                            </p>
                            <p className="text-xs text-ink-500 mt-0.5">
                              {g.batchNumber ?? "PM batch"}
                              {g.batchStatus ? ` · ${g.batchStatus.replace(/_/g, " ").toLowerCase()}` : ""}
                              {" · "}work starts once its method statement, hazard analysis and permit are approved.
                            </p>
                          </div>
                          <Button href={`/pm-batches/${g.batchId}`} className="shrink-0">
                            Open batch
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink-900">Not assigned yet</p>
                            <p className="text-xs text-ink-500 mt-0.5">
                              {canAssign
                                ? batchable
                                  ? `Assigning raises the PM batch for ${g.rows.length === 1 ? "this machine" : `all ${g.rows.length} machines`}. Work starts once its documents are approved.`
                                  : "Assigning names who carries this out."
                                : "A foreman or manager assigns this when it is due, which raises its PM batch."}
                            </p>
                          </div>
                          {canAssign && (
                            <Button
                              icon={Users}
                              className="shrink-0"
                              onClick={() => {
                                setViewingCategoryGroup(null);
                                setAssign(g.firstRow);
                              }}
                            >
                              Assign
                            </Button>
                          )}
                        </>
                      )}
                    </section>
                  )}

                  <section aria-labelledby="coverage-machines">
                    <h4 id="coverage-machines" className="text-xs font-semibold text-ink-500 mb-1">
                      Machines · {g.rows.length}
                    </h4>
                    <ul className="divide-y divide-line max-h-72 overflow-y-auto">
                      {g.rows.map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-3 py-2.5">
                          <Link
                            href={`/equipment/${(row.assetId ?? row.equipmentId).replace(/\//g, "-")}`}
                            className="min-w-0 group/m"
                          >
                            <span className="block text-sm font-medium text-ink-900 truncate group-hover/m:text-brand-700 group-hover/m:underline underline-offset-2">
                              {row.equipmentName ?? "Unnamed equipment"}
                            </span>
                            <span className="block text-xs text-ink-500 tabular-nums">{row.assetId ?? "-"}</span>
                          </Link>
                          {row.workOrderId ? (
                            <Link
                              href={`/work-orders/${row.workOrderId}`}
                              className="text-xs font-medium text-brand-700 hover:underline shrink-0 tabular-nums"
                            >
                              {row.workOrderNumber ?? "Work order"}
                            </Link>
                          ) : row.status !== g.status ? (
                            <Badge className={SCHEDULE_STATUS_BADGE[row.status]}>
                              {SCHEDULE_STATUS_LABELS[row.status] ?? row.status}
                            </Badge>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              );
            })()}
        </Modal>
      </main>
    </div>
  );
}

function FilterField({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <span className={LABEL_CLASS}>{label}</span>
      <Select ariaLabel={label} value={value} onChange={onChange} className="w-full">
        {children}
      </Select>
    </div>
  );
}

// Four narrowing filters behind one control. Each is used now and then; the
// search box is used constantly, and it was getting a quarter of the row.
function FilterPopover({
  activeCount,
  onClear,
  children,
}: {
  activeCount: number;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium transition-colors ${
          activeCount > 0
            ? "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100"
            : "border-line bg-surface text-ink-700 hover:bg-ink-50"
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        Filters
        {activeCount > 0 && (
          <span className="min-w-5 h-5 px-1 rounded-full bg-brand-600 text-white text-xs font-semibold grid place-items-center tabular-nums">
            {activeCount}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filter the schedule"
          className="absolute left-0 top-full mt-1.5 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface shadow-raised p-4 space-y-3"
        >
          {children}
          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={onClear}
              disabled={activeCount === 0}
              className="text-xs font-semibold text-ink-500 hover:text-ink-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear all
            </button>
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// useSearchParams suspends, so the page needs a boundary or the build cannot
// prerender it.
export default function SchedulePage() {
  return (
    <Suspense fallback={null}>
      <SchedulePageView />
    </Suspense>
  );
}
