// src/app/settings/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { SlidersHorizontal, Clock, Save, ShieldAlert, Loader2, CalendarDays, Info, BellRing } from "lucide-react";
import { toast } from "sonner";
import Button from "@/components/Button";
import { ROLE_LABELS, SETTINGS_WRITE_ROLES } from "@/lib/roles";
import {
  productiveHoursPerDay,
  productionDowntimeHours,
  type WorkSettings,
  DEFAULT_WORK_SETTINGS,
} from "@/lib/worktime";

// Display order Mon→Sun (JS weekday numbers, 0=Sun..6=Sat).
const DAYS: { n: number; label: string }[] = [
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
  { n: 0, label: "Sun" },
];

export default function AppSettingsPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const canWrite = !!role && SETTINGS_WRITE_ROLES.includes(role);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<WorkSettings>(DEFAULT_WORK_SETTINGS);
  const [lunchEnabled, setLunchEnabled] = useState(true);
  const [meta, setMeta] = useState<{ updatedByName: string | null; updatedAt: string | null }>({
    updatedByName: null,
    updatedAt: null,
  });

  // Live preview window — demonstrates the maths against the *unsaved* form.
  const [previewStart, setPreviewStart] = useState("");
  const [previewEnd, setPreviewEnd] = useState("");

  const [escalating, setEscalating] = useState(false);

  const runEscalation = async () => {
    setEscalating(true);
    try {
      const res = await fetch("/api/escalations/run", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Escalation run failed.");
        return;
      }
      if (d.notificationsSent === 0 && d.skippedDuplicate === 0) {
        toast.success("Nothing overdue or due soon — no reminders needed.");
      } else if (d.notificationsSent === 0) {
        toast.success(`Already notified today — ${d.skippedDuplicate} digest(s) skipped.`);
      } else {
        toast.success(
          `${d.overdueActivities} overdue, ${d.upcomingActivities} due soon, ` +
            `${d.lapsedPermits} lapsed permit(s) → ${d.notificationsSent} notification(s) sent.`,
        );
      }
    } catch {
      toast.error("Escalation run failed.");
    } finally {
      setEscalating(false);
    }
  };

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d && !d.error) {
          setForm({
            workDayStart: d.workDayStart,
            workDayEnd: d.workDayEnd,
            lunchStart: d.lunchStart,
            lunchEnd: d.lunchEnd,
            workingDays: d.workingDays,
            weekendOvertime: d.weekendOvertime,
          });
          setLunchEnabled(!!(d.lunchStart && d.lunchEnd));
          setMeta({ updatedByName: d.updatedByName, updatedAt: d.updatedAt });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const effective: WorkSettings = useMemo(
    () => ({ ...form, lunchStart: lunchEnabled ? form.lunchStart : null, lunchEnd: lunchEnabled ? form.lunchEnd : null }),
    [form, lunchEnabled],
  );

  const perDay = useMemo(() => productiveHoursPerDay(effective), [effective]);
  const previewHours = useMemo(
    () => (previewStart && previewEnd ? productionDowntimeHours(previewStart, previewEnd, effective) : null),
    [previewStart, previewEnd, effective],
  );

  const toggleDay = (n: number) =>
    setForm((f) => ({
      ...f,
      workingDays: f.workingDays.includes(n) ? f.workingDays.filter((d) => d !== n) : [...f.workingDays, n].sort(),
    }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lunchStart: lunchEnabled ? form.lunchStart : null,
          lunchEnd: lunchEnabled ? form.lunchEnd : null,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to save settings.");
        return;
      }
      setMeta({ updatedByName: d.updatedByName, updatedAt: d.updatedAt });
      toast.success("Working-hours settings saved. Downtime & KPIs now use these hours.");
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="p-10 max-w-md mx-auto text-center space-y-3">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-900">Access restricted</h2>
        <p className="text-sm text-slate-500">
          App settings are available to Super Admins only. Your role is{" "}
          <span className="font-semibold">{ROLE_LABELS[role ?? "VIEWER"] ?? role}</span>.
        </p>
      </div>
    );
  }

  const label = "text-xs font-semibold text-slate-500 uppercase tracking-wide";
  const timeField =
    "bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40";

  return (
    <div className="p-6 max-w-3xl w-full mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">App Settings</h2>
            <p className="text-xs text-slate-500 font-mono">Super Admin · production calendar & working hours</p>
          </div>
        </div>
        <Button onClick={save} loading={saving} icon={Save}>
          Save Settings
        </Button>
      </div>

      {/* Why it matters */}
      <div className="flex items-start gap-2.5 p-3 rounded-lg bg-sky-50 border border-sky-100 text-sky-800 text-xs">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          Downtime, MTTR and MTBF count <strong>production hours</strong>, not wall-clock hours. A machine that stops at
          16:00 Friday and is restored 09:00 Monday is down only the hours the workshop would have been running — the
          weekend and off-shift hours below are excluded automatically.
        </p>
      </div>

      {/* Working hours */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-600" /> Daily Working Window
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Work start</label>
            <input type="time" value={form.workDayStart} onChange={(e) => setForm((f) => ({ ...f, workDayStart: e.target.value }))} className={`${timeField} w-full`} />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Work end</label>
            <input type="time" value={form.workDayEnd} onChange={(e) => setForm((f) => ({ ...f, workDayEnd: e.target.value }))} className={`${timeField} w-full`} />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Lunch start</label>
            <input type="time" value={form.lunchStart ?? ""} disabled={!lunchEnabled} onChange={(e) => setForm((f) => ({ ...f, lunchStart: e.target.value }))} className={`${timeField} w-full disabled:opacity-50`} />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Lunch end</label>
            <input type="time" value={form.lunchEnd ?? ""} disabled={!lunchEnabled} onChange={(e) => setForm((f) => ({ ...f, lunchEnd: e.target.value }))} className={`${timeField} w-full disabled:opacity-50`} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={lunchEnabled} onChange={(e) => setLunchEnabled(e.target.checked)} className="accent-emerald-600 w-4 h-4" />
          Deduct a lunch break from production time
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Productive hours per working day:</span>
          <span className="font-bold text-emerald-700 font-mono">{perDay.toFixed(2)} h</span>
        </div>
      </section>

      {/* Working days */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-emerald-600" /> Production Days
        </h3>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = form.workingDays.includes(d.n);
            return (
              <button
                key={d.n}
                type="button"
                onClick={() => toggleDay(d.n)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  on
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={form.weekendOvertime} onChange={(e) => setForm((f) => ({ ...f, weekendOvertime: e.target.checked }))} className="accent-emerald-600 w-4 h-4" />
          Count weekend (Sat/Sun) hours as production time when worked (overtime)
        </label>
      </section>

      {/* Live downtime preview */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Downtime Preview</h3>
        <p className="text-xs text-slate-500">Test the current (unsaved) settings against any outage window.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={label}>Machine went down</label>
            <input type="datetime-local" value={previewStart} onChange={(e) => setPreviewStart(e.target.value)} className={`${timeField} w-full`} />
          </div>
          <div className="space-y-1.5">
            <label className={label}>Restored to service</label>
            <input type="datetime-local" value={previewEnd} onChange={(e) => setPreviewEnd(e.target.value)} className={`${timeField} w-full`} />
          </div>
        </div>
        {previewHours !== null && (
          <div className="flex items-center gap-2 text-sm p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500">Production downtime:</span>
            <span className="font-bold text-slate-900 font-mono">{previewHours.toFixed(2)} h</span>
          </div>
        )}
      </section>

      {/* Overdue escalations */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
          <BellRing className="w-4 h-4 text-emerald-600" /> Maintenance Reminders &amp; Escalations
        </h3>
        <p className="text-xs text-slate-500">
          Reminds responsible people about maintenance <strong>due soon</strong>, and escalates <strong>overdue</strong>
          activities and lapsed permits to them and to managers. Runs safely any number of times a day (each item is only
          notified once). Wire the endpoint to a daily scheduler, or run it on demand here.
        </p>
        <Button variant="secondary" icon={BellRing} loading={escalating} onClick={runEscalation}>
          Run escalation now
        </Button>
      </section>

      {meta.updatedByName && (
        <p className="text-[11px] text-slate-400 text-right">
          Last updated by {meta.updatedByName}
          {meta.updatedAt ? ` · ${new Date(meta.updatedAt).toLocaleString()}` : ""}
        </p>
      )}
    </div>
  );
}
