// src/components/EquipmentLog.tsx
// The machine's history log: every action on a machine (PMs, repairs,
// inspections, accidents, transfers, diagnoses, status changes, documents,
// notes) in one table, in date order (LIMSL, 20 Nov 2026).
//
// It was a timeline of cards. A timeline reads well for ten entries and badly
// for three hundred, and a legacy workbook imports hundreds at once: what
// people need then is to sort by date, narrow by type, year and where the
// entry came from, and search. Reused by the equipment page's History tab and
// the /history page.
"use client";

import DateTimeField from "@/components/DateTimeField";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, FilterX, History, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import LocationField from "@/components/LocationField";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";

type Event = {
  id: string;
  category: string;
  title: string;
  detail: string | null;
  href: string | null;
  source: "AUTO" | "MANUAL" | "DERIVED";
  legacy?: boolean;
  performedByName: string | null;
  occurredAt: string;
};

const NEUTRAL = "bg-ink-500/10 text-ink-600 border-ink-500/20";
const CATEGORY_META: Record<string, { label: string; badge: string }> = {
  PM: { label: "PM", badge: "bg-brand-500/10 text-brand-700 border-brand-500/20" },
  CM: { label: "Repair", badge: "bg-danger-500/10 text-danger-700 border-danger-500/20" },
  INSPECTION: { label: "Inspection", badge: "bg-info-500/10 text-info-700 border-info-500/20" },
  ACCIDENT: { label: "Accident", badge: "bg-danger-500/10 text-danger-700 border-danger-500/20" },
  TRANSFER: { label: "Transfer", badge: NEUTRAL },
  DIAGNOSIS: { label: "Diagnosis", badge: "bg-info-500/10 text-info-700 border-info-500/20" },
  STATUS: { label: "Status", badge: "bg-warn-500/10 text-warn-700 border-warn-500/20" },
  CALIBRATION: { label: "Calibration", badge: "bg-info-500/10 text-info-700 border-info-500/20" },
  PREMOB: { label: "Premob", badge: "bg-info-500/10 text-info-700 border-info-500/20" },
  VERIFICATION: { label: "Verification", badge: "bg-info-500/10 text-info-700 border-info-500/20" },
  DOCUMENT: { label: "Document", badge: NEUTRAL },
  METER: { label: "Meter", badge: NEUTRAL },
  NOTE: { label: "Note", badge: NEUTRAL },
  OTHER: { label: "Other", badge: NEUTRAL },
};
const metaOf = (category: string) => CATEGORY_META[category] ?? CATEGORY_META.OTHER;

const MANUAL_CATEGORIES = [
  { value: "NOTE", label: "Note / observation" },
  { value: "ACCIDENT", label: "Accident / incident" },
  { value: "TRANSFER", label: "Transfer / relocation" },
  { value: "INSPECTION", label: "Inspection" },
  { value: "CALIBRATION", label: "Calibration" },
  { value: "STATUS", label: "Status note" },
  { value: "OTHER", label: "Other" },
];

// Where an entry came from, in the reader's words.
type Origin = "SYSTEM" | "MANUAL" | "LEGACY";
const ORIGIN_LABELS: Record<Origin, string> = {
  SYSTEM: "Recorded by the system",
  MANUAL: "Entered by hand",
  LEGACY: "Legacy history log",
};
const originOf = (e: Event): Origin => (e.legacy ? "LEGACY" : e.source === "MANUAL" ? "MANUAL" : "SYSTEM");

// Dates arrive as a bare day from the legacy log and as a full timestamp from
// the system. The day decides the order; the time only separates the same day.
const dayOf = (s: string) => s.slice(0, 10);
const orderKey = (e: Event) => `${dayOf(e.occurredAt)}|${e.occurredAt.slice(10)}`;

const PAGE = 50;

export default function EquipmentLog({ assetId, canWrite }: { assetId: string; canWrite: boolean }) {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("ALL");
  const [origin, setOrigin] = useState("ALL");
  const [year, setYear] = useState("ALL");
  const [newestFirst, setNewestFirst] = useState(true);
  const [shown, setShown] = useState(PAGE);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: "NOTE", title: "", detail: "", occurredAt: "", newLocation: "" });

  const load = () => {
    setFailed(false);
    fetch(`/api/equipment/${assetId}/log`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setEvents(d.events ?? []))
      .catch(() => {
        setEvents([]);
        setFailed(true);
      });
  };
  useEffect(load, [assetId]);

  const all = useMemo(() => events ?? [], [events]);
  const categories = useMemo(
    () => [...new Set(all.map((e) => e.category))].sort((a, b) => metaOf(a).label.localeCompare(metaOf(b).label)),
    [all],
  );
  const years = useMemo(() => [...new Set(all.map((e) => e.occurredAt.slice(0, 4)))].filter((y) => /^\d{4}$/.test(y)).sort().reverse(), [all]);
  const origins = useMemo(() => [...new Set(all.map(originOf))], [all]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out = all.filter(
      (e) =>
        (category === "ALL" || e.category === category) &&
        (origin === "ALL" || originOf(e) === origin) &&
        (year === "ALL" || e.occurredAt.startsWith(year)) &&
        (!term ||
          e.title.toLowerCase().includes(term) ||
          (e.detail ?? "").toLowerCase().includes(term) ||
          (e.performedByName ?? "").toLowerCase().includes(term)),
    );
    out.sort((a, b) => orderKey(a).localeCompare(orderKey(b)));
    return newestFirst ? out.reverse() : out;
  }, [all, q, category, origin, year, newestFirst]);

  const filtersOn = q.trim() !== "" || category !== "ALL" || origin !== "ALL" || year !== "ALL";
  const clearFilters = () => {
    setQ("");
    setCategory("ALL");
    setOrigin("ALL");
    setYear("ALL");
  };
  // A new filter starts again from the top of the list.
  const narrow = (set: (v: string) => void) => (v: string) => {
    set(v);
    setShown(PAGE);
  };

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

  const field = "w-full bg-ink-50 border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500/40";
  const SortIcon = newestFirst ? ArrowDown : ArrowUp;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem] max-w-sm">
          <Search className="w-4 h-4 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => narrow(setQ)(e.target.value)}
            aria-label="Search this machine's history"
            placeholder="Search entries or people"
            className="w-full h-9 pl-8 pr-3 bg-canvas border border-line rounded-lg text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/15"
          />
        </div>
        <Select value={category} onChange={narrow(setCategory)} ariaLabel="Type of entry" className="w-40">
          <option value="ALL">All types</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {metaOf(c).label}
            </option>
          ))}
        </Select>
        <Select value={year} onChange={narrow(setYear)} ariaLabel="Year" className="w-32">
          <option value="ALL">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        {origins.length > 1 && (
          <Select value={origin} onChange={narrow(setOrigin)} ariaLabel="Where the entry came from" className="w-52">
            <option value="ALL">All sources</option>
            {origins.map((o) => (
              <option key={o} value={o}>
                {ORIGIN_LABELS[o]}
              </option>
            ))}
          </Select>
        )}
        {events !== null && (
          <span className="text-xs text-ink-500 tabular-nums whitespace-nowrap" aria-live="polite">
            {filtered.length === all.length ? `${all.length} entr${all.length === 1 ? "y" : "ies"}` : `${filtered.length} of ${all.length}`}
          </span>
        )}
        {canWrite && (
          <Button size="sm" icon={Plus} onClick={() => setShowAdd(true)} className="ml-auto shrink-0">
            Add entry
          </Button>
        )}
      </div>

      <div className="border border-line rounded-xl overflow-hidden bg-surface">
        {events === null ? (
          <TableSkeleton rows={6} cols={5} />
        ) : failed ? (
          <EmptyState
            icon={History}
            title="The history could not be loaded"
            message="Check the connection and try again."
            actionLabel="Try again"
            onAction={load}
          />
        ) : filtered.length === 0 ? (
          filtersOn ? (
            <EmptyState
              icon={FilterX}
              title="No entries match these filters"
              message="Nothing in this machine's history matches the search and filters."
              actionLabel="Clear filters"
              onAction={clearFilters}
            />
          ) : (
            <EmptyState
              icon={History}
              title="No history recorded yet"
              message="PMs, repairs, inspections and transfers appear here as they happen. Entries from the legacy history log are added through Settings, Import."
              actionLabel={canWrite ? "Add entry" : undefined}
              onAction={canWrite ? () => setShowAdd(true) : undefined}
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-ink-200 text-ink-500">
                  <th className="py-3 px-4 font-medium whitespace-nowrap" aria-sort={newestFirst ? "descending" : "ascending"}>
                    <button
                      type="button"
                      onClick={() => setNewestFirst((v) => !v)}
                      className="inline-flex items-center gap-1 font-medium text-ink-700 hover:text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 rounded-lg"
                      title={newestFirst ? "Newest first. Click for oldest first." : "Oldest first. Click for newest first."}
                    >
                      Date
                      <SortIcon className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Entry</th>
                  <th className="py-3 px-4 font-medium whitespace-nowrap">By</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-4 font-medium">
                    <span className="sr-only">Record</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {filtered.slice(0, shown).map((ev) => {
                  const meta = metaOf(ev.category);
                  // The legacy log repeats the description as the first line of its detail.
                  const rest = ev.detail?.trim().startsWith(ev.title.trim()) ? ev.detail.trim().slice(ev.title.trim().length).trim() : ev.detail?.trim();
                  const detail = rest || null;
                  return (
                    <tr key={ev.id} className="hover:bg-ink-50 align-top">
                      <td className="py-3 px-4 tabular-nums text-ink-900 whitespace-nowrap">{formatDate(dayOf(ev.occurredAt))}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <Badge className={meta.badge}>{meta.label}</Badge>
                      </td>
                      <td className="py-3 px-4 min-w-64">
                        <p className="font-medium text-ink-900 break-words">{ev.title}</p>
                        {detail && <p className="text-ink-600 mt-0.5 break-words whitespace-pre-line">{detail}</p>}
                      </td>
                      <td className="py-3 px-4 text-ink-700 whitespace-nowrap">{ev.legacy ? "-" : ev.performedByName || "-"}</td>
                      <td className="py-3 px-4 text-ink-600 whitespace-nowrap">{ORIGIN_LABELS[originOf(ev)]}</td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {ev.href && (
                          <Link href={ev.href} className="font-semibold text-brand-700 hover:underline">
                            Open
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filtered.length > shown && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, filtered.length - shown)} more
          </Button>
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add log entry" subtitle="Records against this machine's history">
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">Category</label>
              <Select value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} className="w-full">
                {MANUAL_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">When</label>
              <DateTimeField value={form.occurredAt} onChange={(v) => setForm((f) => ({ ...f, occurredAt: v }))} ariaLabel="When it happened" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-ink-700">Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Operator reported unusual vibration" className={field} required />
          </div>
          {form.category === "TRANSFER" && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-ink-700">New location (updates the asset)</label>
              <LocationField value={form.newLocation} onChange={(v) => setForm((f) => ({ ...f, newLocation: v }))} />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-sm font-medium text-ink-700">Detail (optional)</label>
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
