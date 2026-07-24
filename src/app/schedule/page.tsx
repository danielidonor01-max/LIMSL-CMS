// src/app/schedule/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Plus,
  Search,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import ScheduleCalendar from "@/components/ScheduleCalendar";
import { formatDate } from "@/lib/utils";
import {
  ACTIVITY_TYPE_BADGE,
  ACTIVITY_TYPE_LABELS,
  SCHEDULE_STATUS_BADGE,
  SCHEDULE_STATUS_LABELS,
  EQUIPMENT_CATEGORY_LABELS,
  MONTH_NAMES,
} from "@/lib/constants";
import { CalendarDays, List } from "lucide-react";

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
  status: string;
  completedDate: string | null;
  workOrderId: string | null;
  equipmentName: string | null;
  assetId: string | null;
  category: string | null;
  criticality: string | null;
  location: string | null;
};

const TODAY = new Date().toISOString().slice(0, 10);

const emptyCreate = {
  equipmentId: "",
  plannedDate: "",
  activityType: "PM",
  maintenanceFrequency: "MONTHLY",
  taskDescription: "",
  responsiblePersonName: "",
};

export default function SchedulePage() {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"upcoming" | "all">("upcoming");
  const [view, setView] = useState<"list" | "calendar">("list");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [quarterFilter, setQuarterFilter] = useState("ALL");

  const [equipmentList, setEquipmentList] = useState<{ id: string; assetId: string; name: string }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreate);
  const [saving, setSaving] = useState(false);
  const [reschedule, setReschedule] = useState<{ row: ScheduleRow; date: string } | null>(null);

  const load = () => {
    fetch("/api/schedule")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    fetch("/api/equipment")
      .then((r) => r.json())
      .then((d) => setEquipmentList(Array.isArray(d) ? d : []))
      .catch(() => setEquipmentList([]));
  }, []);

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
      toast.success("Activity scheduled.");
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
        body: JSON.stringify({ plannedDate: reschedule.date }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to reschedule.");
        return;
      }
      toast.success("Activity rescheduled.");
      setReschedule(null);
      load();
    } catch {
      toast.error("Failed to reschedule.");
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

  const filtered = useMemo(() => {
    let out = rows;
    if (tab === "upcoming") {
      const in60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
      out = out.filter(
        (r) => r.status !== "COMPLETED" && r.plannedDate >= TODAY && r.plannedDate <= in60,
      );
      out = [...out].sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    } else {
      out = [...out].sort((a, b) => b.plannedDate.localeCompare(a.plannedDate));
    }
    if (typeFilter !== "ALL") out = out.filter((r) => r.activityType === typeFilter);
    if (statusFilter !== "ALL") out = out.filter((r) => r.status === statusFilter);
    if (quarterFilter !== "ALL") out = out.filter((r) => String(r.quarter) === quarterFilter);
    if (q.trim()) {
      const term = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.equipmentName?.toLowerCase().includes(term) ||
          r.assetId?.toLowerCase().includes(term) ||
          r.responsiblePersonName?.toLowerCase().includes(term),
      );
    }
    return out;
  }, [rows, tab, typeFilter, statusFilter, quarterFilter, q]);

  const stat = (
    label: string,
    value: string,
    icon: React.ReactNode,
    tone: string,
    sub: string,
  ) => (
    <div className={`p-4 rounded-xl border ${tone} backdrop-blur-sm`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        <div className="p-1.5 rounded-lg bg-slate-100">{icon}</div>
      </div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      <p className="text-[11px] text-slate-500 mt-1">{sub}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Annual Maintenance Schedule</h2>
              <p className="text-xs text-slate-500 font-mono">
                LIMSL-MAIN-PLN-013 · {new Date().getFullYear()} plan
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1">
              <button
                onClick={() => setView("list")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  view === "list" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <List className="w-3.5 h-3.5" /> List
              </button>
              <button
                onClick={() => setView("calendar")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  view === "calendar" ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" /> Calendar
              </button>
            </div>
            <Button variant="secondary" icon={CalendarPlus} onClick={() => setShowCreate(true)}>
              Schedule PM
            </Button>
            <Link
              href="/work-orders/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all"
            >
              <Plus className="w-4 h-4" /> New Work Order
            </Link>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stat(
            "PM Compliance",
            `${summary.compliance}%`,
            <ShieldCheck className="w-4 h-4 text-emerald-600" />,
            summary.compliance >= 95
              ? "bg-emerald-500/5 border-emerald-500/15"
              : summary.compliance >= 50
                ? "bg-amber-500/5 border-amber-500/15"
                : "bg-rose-500/5 border-rose-500/15",
            "Completed ÷ due PM · target ≥95%",
          )}
          {stat(
            "Overdue",
            String(summary.overdue),
            <AlertTriangle className="w-4 h-4 text-rose-600" />,
            "bg-rose-500/5 border-rose-500/15",
            "Activities past their planned date",
          )}
          {stat(
            "Upcoming",
            String(summary.upcoming),
            <Clock className="w-4 h-4 text-sky-600" />,
            "bg-sky-500/5 border-sky-500/15",
            "Scheduled activities still ahead",
          )}
          {stat(
            "Completed",
            String(summary.completed),
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
            "bg-emerald-500/5 border-emerald-500/15",
            "PM activities signed off this year",
          )}
        </div>

        {view === "calendar" && <ScheduleCalendar rows={rows} />}

        {view === "list" && (
        <>
        {/* Tabs + filters */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1 w-fit">
            {(["upcoming", "all"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  tab === t
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {t === "upcoming" ? "Upcoming (60 days)" : "All Activities"}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search equipment / tag…"
                className="pl-8 pr-3 py-1.5 bg-slate-100 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/40 w-48"
              />
            </div>
            <FilterSelect value={typeFilter} onChange={setTypeFilter} label="Type">
              <option value="ALL">All types</option>
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </FilterSelect>
            <FilterSelect value={statusFilter} onChange={setStatusFilter} label="Status">
              <option value="ALL">All statuses</option>
              {Object.entries(SCHEDULE_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </FilterSelect>
            <FilterSelect value={quarterFilter} onChange={setQuarterFilter} label="Quarter">
              <option value="ALL">All quarters</option>
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </FilterSelect>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center items-center text-slate-500">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
              <span className="text-xs ml-2 font-mono">Loading schedule…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              No activities match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-3 px-4 font-medium">Planned</th>
                    <th className="py-3 px-4 font-medium">Equipment</th>
                    <th className="py-3 px-4 font-medium">Activity</th>
                    <th className="py-3 px-4 font-medium">Freq.</th>
                    <th className="py-3 px-4 font-medium">Responsible</th>
                    <th className="py-3 px-4 font-medium">Status</th>
                    <th className="py-3 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono text-slate-900">{formatDate(r.plannedDate)}</div>
                        <div className="text-[10px] text-slate-500">
                          {r.month ? MONTH_NAMES[r.month - 1] : ""} · Q{r.quarter}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 max-w-[220px] truncate">
                          {r.equipmentName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500">
                          {r.assetId} · {r.category ? EQUIPMENT_CATEGORY_LABELS[r.category] : ""}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={ACTIVITY_TYPE_BADGE[r.activityType]}>
                          {r.activityType}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {r.maintenanceFrequency?.replace(/_/g, " ").toLowerCase() ?? "—"}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{r.responsiblePersonName ?? "—"}</td>
                      <td className="py-3 px-4">
                        <Badge className={SCHEDULE_STATUS_BADGE[r.status]}>
                          {SCHEDULE_STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-3">
                          {r.status !== "COMPLETED" && (
                            <button
                              onClick={() => setReschedule({ row: r, date: r.plannedDate })}
                              className="text-slate-500 hover:text-slate-900 hover:underline"
                            >
                              Reschedule
                            </button>
                          )}
                          {r.workOrderId ? (
                            <Link
                              href={`/work-orders/${r.workOrderId}`}
                              className="text-emerald-600 hover:underline"
                            >
                              View WO →
                            </Link>
                          ) : (
                            <Link
                              href={`/work-orders/new?scheduleId=${r.id}`}
                              className="text-sky-600 hover:underline"
                            >
                              Raise WO
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-[11px] text-slate-500">
          Showing {filtered.length} of {rows.length} scheduled activities.
        </p>
        </>
        )}

        {/* Schedule a new activity */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Schedule Maintenance Activity" subtitle="Recurring activities regenerate automatically on completion">
          <form onSubmit={submitCreate} className="space-y-4">
            <div className="space-y-1.5">
              <label className={modalLabel}>Equipment</label>
              <Select
                value={createForm.equipmentId}
                onChange={(v) => setCreateForm((f) => ({ ...f, equipmentId: v }))}
                className="w-full"
                required
              >
                <option value="">Select equipment…</option>
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.assetId} — {eq.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={modalLabel}>Planned date</label>
                <input
                  type="date"
                  value={createForm.plannedDate}
                  onChange={(e) => setCreateForm((f) => ({ ...f, plannedDate: e.target.value }))}
                  className={modalField}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className={modalLabel}>Activity type</label>
                <Select
                  value={createForm.activityType}
                  onChange={(v) => setCreateForm((f) => ({ ...f, activityType: v }))}
                  className="w-full"
                >
                  {Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={modalLabel}>Frequency</label>
              <Select
                value={createForm.maintenanceFrequency}
                onChange={(v) => setCreateForm((f) => ({ ...f, maintenanceFrequency: v }))}
                className="w-full"
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className={modalLabel}>Task description</label>
              <input
                type="text"
                value={createForm.taskDescription}
                onChange={(e) => setCreateForm((f) => ({ ...f, taskDescription: e.target.value }))}
                placeholder="e.g. Monthly lubrication & belt inspection"
                className={modalField}
              />
            </div>
            <div className="space-y-1.5">
              <label className={modalLabel}>Responsible (optional)</label>
              <input
                type="text"
                value={createForm.responsiblePersonName}
                onChange={(e) => setCreateForm((f) => ({ ...f, responsiblePersonName: e.target.value }))}
                placeholder="Assigned technician / team"
                className={modalField}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" loading={saving} icon={CalendarPlus}>Schedule</Button>
            </div>
          </form>
        </Modal>

        {/* Reschedule an activity */}
        <Modal open={!!reschedule} onClose={() => setReschedule(null)} title="Reschedule Activity" subtitle={reschedule ? `${reschedule.row.assetId ?? ""} · ${reschedule.row.activityType}` : ""}>
          {reschedule && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">
                Currently planned for <span className="font-mono text-slate-700">{formatDate(reschedule.row.plannedDate)}</span>.
              </p>
              <div className="space-y-1.5">
                <label className={modalLabel}>New planned date</label>
                <input
                  type="date"
                  value={reschedule.date}
                  onChange={(e) => setReschedule((r) => (r ? { ...r, date: e.target.value } : r))}
                  className={modalField}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setReschedule(null)}>Cancel</Button>
                <Button type="button" loading={saving} onClick={submitReschedule}>Reschedule</Button>
              </div>
            </div>
          )}
        </Modal>
      </main>
    </div>
  );
}

const modalLabel = "text-[11px] font-semibold text-slate-500 uppercase tracking-wide";
const modalField =
  "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40";

function FilterSelect({
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
    <Select
      ariaLabel={label}
      value={value}
      onChange={(v) => onChange(v)}
    >
      {children}
    </Select>
  );
}
