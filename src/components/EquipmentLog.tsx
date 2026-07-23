// src/components/EquipmentLog.tsx
// The machine lifetime history log — a unified, filterable timeline of every
// action on a machine (PMs, CMs, inspections, accidents, transfers, diagnoses,
// status changes, documents, notes), auto-populated by the flows and manually
// extendable. Responsive: a vertical timeline that reads cleanly on phones and
// desktop alike. Reused by the digital-twin History tab and the /history page.
"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Wrench, AlertTriangle, ClipboardCheck, Truck, Stethoscope, Activity,
  FileText, StickyNote, Gauge, CircleDot, Plus, Loader2, ExternalLink, Filter,
} from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import Button from "@/components/Button";

type Event = {
  id: string;
  category: string;
  title: string;
  detail: string | null;
  href: string | null;
  source: "AUTO" | "MANUAL" | "DERIVED";
  performedByName: string | null;
  occurredAt: string;
};

const CATEGORY_META: Record<string, { label: string; icon: typeof Wrench; color: string; ring: string }> = {
  PM: { label: "PM", icon: ClipboardCheck, color: "text-emerald-600", ring: "bg-emerald-50 border-emerald-200" },
  CM: { label: "Corrective", icon: Wrench, color: "text-rose-600", ring: "bg-rose-50 border-rose-200" },
  INSPECTION: { label: "Inspection", icon: Gauge, color: "text-sky-600", ring: "bg-sky-50 border-sky-200" },
  ACCIDENT: { label: "Accident", icon: AlertTriangle, color: "text-orange-600", ring: "bg-orange-50 border-orange-200" },
  TRANSFER: { label: "Transfer", icon: Truck, color: "text-violet-600", ring: "bg-violet-50 border-violet-200" },
  DIAGNOSIS: { label: "Diagnosis", icon: Stethoscope, color: "text-indigo-600", ring: "bg-indigo-50 border-indigo-200" },
  STATUS: { label: "Status", icon: Activity, color: "text-amber-600", ring: "bg-amber-50 border-amber-200" },
  CALIBRATION: { label: "Calibration", icon: Gauge, color: "text-teal-600", ring: "bg-teal-50 border-teal-200" },
  DOCUMENT: { label: "Document", icon: FileText, color: "text-slate-500", ring: "bg-slate-50 border-slate-200" },
  NOTE: { label: "Note", icon: StickyNote, color: "text-slate-500", ring: "bg-slate-50 border-slate-200" },
  OTHER: { label: "Other", icon: CircleDot, color: "text-slate-500", ring: "bg-slate-50 border-slate-200" },
};

const FILTERS = ["ALL", "PM", "CM", "INSPECTION", "ACCIDENT", "TRANSFER", "DIAGNOSIS", "STATUS", "DOCUMENT", "NOTE"];
const MANUAL_CATEGORIES = [
  { value: "NOTE", label: "Note / observation" },
  { value: "ACCIDENT", label: "Accident / incident" },
  { value: "TRANSFER", label: "Transfer / relocation" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "CALIBRATION", label: "Calibration" },
  { value: "STATUS", label: "Status note" },
  { value: "OTHER", label: "Other" },
];

const fmtDate = (s: string) => {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export default function EquipmentLog({ assetId, canWrite }: { assetId: string; canWrite: boolean }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: "NOTE", title: "", detail: "", occurredAt: "", newLocation: "" });

  const load = () => {
    fetch(`/api/equipment/${assetId}/log`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((d) => setEvents(d.events ?? []))
      .catch(() => setEvents([]));
  };
  useEffect(load, [assetId]);

  const filtered = useMemo(
    () => (events ?? []).filter((e) => filter === "ALL" || e.category === filter),
    [events, filter],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Enter a title.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/equipment/${assetId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          title: form.title.trim(),
          detail: form.detail.trim() || undefined,
          occurredAt: form.occurredAt ? new Date(form.occurredAt).toISOString() : undefined,
          newLocation: form.category === "TRANSFER" ? form.newLocation.trim() || undefined : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to add entry.");
        return;
      }
      toast.success("Log entry added.");
      setShowAdd(false);
      setForm({ category: "NOTE", title: "", detail: "", occurredAt: "", newLocation: "" });
      load();
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/40";

  return (
    <div className="space-y-4">
      {/* Filters + add */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mb-1">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all border ${
                filter === f ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {f === "ALL" ? "All" : CATEGORY_META[f]?.label ?? f}
            </button>
          ))}
        </div>
        {canWrite && (
          <Button size="sm" icon={Plus} onClick={() => setShowAdd(true)} className="sm:ml-auto shrink-0">
            Add entry
          </Button>
        )}
      </div>

      {/* Timeline */}
      {events === null ? (
        <div className="py-12 flex justify-center text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">
          {filter === "ALL" ? "No history recorded for this machine yet." : `No ${CATEGORY_META[filter]?.label ?? filter} entries.`}
        </div>
      ) : (
        <ol className="relative border-l-2 border-slate-100 ml-3 space-y-4">
          {filtered.map((ev) => {
            const meta = CATEGORY_META[ev.category] ?? CATEGORY_META.OTHER;
            const Icon = meta.icon;
            return (
              <li key={ev.id} className="ml-6">
                <span className={`absolute -left-[13px] flex items-center justify-center w-6 h-6 rounded-full border ${meta.ring}`}>
                  <Icon className={`w-3.5 h-3.5 ${meta.color}`} />
                </span>
                <div className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${meta.ring} ${meta.color}`}>
                          {meta.label}
                        </span>
                        {ev.source === "MANUAL" && <span className="text-[9px] text-slate-400 uppercase">manual</span>}
                        {ev.source === "AUTO" && <span className="text-[9px] text-slate-400 uppercase">auto</span>}
                      </div>
                      <p className="text-sm font-medium text-slate-900 mt-1 break-words">{ev.title}</p>
                      {ev.detail && <p className="text-xs text-slate-500 mt-0.5 break-words">{ev.detail}</p>}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">{fmtDate(ev.occurredAt)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    {ev.performedByName && <span className="text-[10px] text-slate-400">by {ev.performedByName}</span>}
                    {ev.href && (
                      <a href={ev.href} className="text-[10px] text-emerald-600 hover:underline inline-flex items-center gap-0.5">
                        Open <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Manual add */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add log entry" subtitle="Records against this machine's history">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase">Category</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={field}>
                {MANUAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase">When</label>
              <input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm((f) => ({ ...f, occurredAt: e.target.value }))} className={field} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Operator reported unusual vibration" className={field} required />
          </div>
          {form.category === "TRANSFER" && (
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-500 uppercase">New location (updates the asset)</label>
              <input value={form.newLocation} onChange={(e) => setForm((f) => ({ ...f, newLocation: e.target.value }))} placeholder="e.g. Bay 3" className={field} />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500 uppercase">Detail (optional)</label>
            <textarea value={form.detail} onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))} rows={3} className={`${field} resize-none`} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" loading={saving} icon={Plus}>Add entry</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
