// src/components/MoveEquipmentModal.tsx
// Move one machine or many to another category (LIMSL, 23 Nov 2026).
//
// Pick where they go, tick the machines, confirm. Each machine takes the new
// category's interval and its untouched future plan is rebuilt on that
// category's calendar; the screen says so before anything is moved, because a
// move changes when a machine is serviced.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, Search } from "lucide-react";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { FREQUENCY_LABELS } from "@/lib/constants";

type Category = { code: string; label: string; maintenanceFrequency: string; isActive?: boolean };
type Machine = { id: string; assetId: string; name: string | null; category: string; status: string | null; removedAt?: string | null };
type Refusal = { id: string; name: string | null; why: string };

export default function MoveEquipmentModal({
  open,
  categories: allCategories,
  initialFrom = "ALL",
  onClose,
  onMoved,
}: {
  open: boolean;
  categories: Category[];
  /** Start with one category's machines listed. */
  initialFrom?: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  // Nothing moves into a retired category, and nothing is left in one.
  const categories = useMemo(() => allCategories.filter((c) => c.isActive !== false), [allCategories]);
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [to, setTo] = useState("");
  const [from, setFrom] = useState(initialFrom);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<Refusal[]>([]);

  // Fresh each time it opens: the register may have changed since.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTo("");
      setFrom(initialFrom);
      setQ("");
      setPicked(new Set());
      setReason("");
      setRefused([]);
      setMachines(null);
    }
  }
  useEffect(() => {
    if (!open) return;
    fetch("/api/equipment")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setMachines(Array.isArray(d) ? d : []))
      .catch(() => setMachines([]));
  }, [open]);

  const labelOf = (code: string) => allCategories.find((c) => c.code === code)?.label ?? code;
  const target = categories.find((c) => c.code === to) ?? null;

  const listed = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (machines ?? [])
      .filter((m) => !m.removedAt && m.status !== "DECOMMISSIONED")
      .filter((m) => from === "ALL" || m.category === from)
      .filter((m) => !term || (m.name ?? "").toLowerCase().includes(term) || m.assetId.toLowerCase().includes(term))
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "") || a.assetId.localeCompare(b.assetId));
  }, [machines, from, q]);

  // A machine already in the target has nowhere to go.
  const movable = listed.filter((m) => m.category !== to);
  const allPicked = movable.length > 0 && movable.every((m) => picked.has(m.id));
  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setPicked((s) => {
      const next = new Set(s);
      for (const m of movable) {
        if (allPicked) next.delete(m.id);
        else next.add(m.id);
      }
      return next;
    });
  const chosen = (machines ?? []).filter((m) => picked.has(m.id) && m.category !== to);

  const submit = async () => {
    if (!to) return toast.error("Choose the category to move them to.");
    if (chosen.length === 0) return toast.error("Tick at least one machine to move.");
    setSaving(true);
    try {
      const res = await fetch("/api/asset-categories/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentIds: chosen.map((m) => m.id), toCategory: to, reason: reason.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not move the equipment.");
        return;
      }
      const n = d.moved?.length ?? 0;
      if (n > 0) toast.success(`${n} machine${n === 1 ? "" : "s"} moved to ${d.toLabel}. Their future plan follows that category.`);
      onMoved();
      if ((d.refused?.length ?? 0) > 0) {
        // Stay open so the ones that did not move can be read.
        setRefused(d.refused);
        setPicked(new Set());
        setMachines(null);
        fetch("/api/equipment")
          .then((r) => (r.ok ? r.json() : []))
          .then((x) => setMachines(Array.isArray(x) ? x : []))
          .catch(() => setMachines([]));
      } else {
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Move equipment to another category"
      subtitle="One machine or several. Each takes the new category's service interval."
      maxWidthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <span className={LABEL_CLASS}>Move to</span>
            <Select value={to} onChange={setTo} className="w-full" ariaLabel="Category to move to" searchable={categories.length > 8}>
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <span className={LABEL_CLASS}>Show machines from</span>
            <Select value={from} onChange={setFrom} className="w-full" ariaLabel="Category to list machines from" searchable={categories.length > 8}>
              <option value="ALL">All categories</option>
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {target && (
          <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink-700">
            Machines moved to <span className="font-semibold text-ink-900">{target.label}</span> are serviced{" "}
            {(FREQUENCY_LABELS[target.maintenanceFrequency] ?? target.maintenanceFrequency).toLowerCase()}. Their future
            visits that nobody has touched are replaced by that category&apos;s dates. Work already done, overdue,
            deferred or under way stays as it is.
          </p>
        )}

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="w-4 h-4 text-ink-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search machines"
                placeholder="Search machine or tag"
                className="w-full h-9 pl-8 pr-3 bg-canvas border border-line rounded-lg text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/15"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-ink-700">
              <input type="checkbox" className="w-4 h-4 accent-brand-600" checked={allPicked} onChange={toggleAll} disabled={movable.length === 0} />
              Select all shown
            </label>
          </div>

          <div className="border border-line rounded-lg max-h-72 overflow-y-auto divide-y divide-line">
            {machines === null ? (
              <p className="px-3 py-6 text-center text-sm text-ink-500">Loading the register…</p>
            ) : listed.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-ink-500">No machines match.</p>
            ) : (
              listed.map((m) => {
                const here = m.category === to;
                return (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm ${here ? "text-ink-400" : "text-ink-900 hover:bg-ink-50 cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-brand-600 shrink-0"
                      checked={picked.has(m.id) && !here}
                      disabled={here}
                      onChange={() => toggle(m.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{m.name || m.assetId}</span>
                      <span className="block text-xs text-ink-500 truncate">
                        {m.assetId} · {here ? "already in this category" : labelOf(m.category)}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        {refused.length > 0 && (
          <div className="rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-xs text-warn-800">
            <p className="font-semibold">
              {refused.length} machine{refused.length === 1 ? " was" : "s were"} not moved
            </p>
            <ul className="mt-1 space-y-0.5">
              {refused.map((r) => (
                <li key={r.id}>
                  {r.name ?? "Machine"}: {r.why}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className={LABEL_CLASS} htmlFor="move-reason">
            Reason (optional)
          </label>
          <input
            id="move-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Lathes are serviced with the press section"
            className={FIELD_CLASS}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-ink-500" aria-live="polite">
            {chosen.length} selected
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button icon={ArrowRightLeft} loading={saving} disabled={!to || chosen.length === 0} onClick={submit}>
              Move {chosen.length || ""} {chosen.length === 1 ? "machine" : "machines"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
