// src/app/work-orders/new/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ClipboardList, Loader2, ArrowLeft, Save } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import {
  WO_TYPE_LABELS,
  WO_TYPE_OPTIONS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
} from "@/lib/constants";

type Equipment = { id: string; assetId: string; name: string; criticality: string | null };
type User = { id: string; name: string; role: string };

function NewWorkOrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const scheduleId = params.get("scheduleId");
  const presetEquipmentId = params.get("equipmentId");

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    equipmentId: "",
    type: "PREVENTIVE",
    priority: "MEDIUM",
    title: "",
    plannedDate: new Date().toISOString().slice(0, 10),
    technicianId: "",
    description: "",
    scheduleId: scheduleId || "",
  });

  useEffect(() => {
    async function load() {
      try {
        const [eqRes, userRes] = await Promise.all([
          fetch("/api/equipment").then((r) => r.json()),
          fetch("/api/users").then((r) => r.json()),
        ]);
        const eqList: Equipment[] = Array.isArray(eqRes) ? eqRes : [];
        setEquipment(eqList);
        setUsers(Array.isArray(userRes) ? userRes : []);

        // Prefill from a scheduled activity
        if (scheduleId) {
          const sched = await fetch("/api/schedule").then((r) => r.json());
          const item = Array.isArray(sched)
            ? sched.find((s: { id: string }) => s.id === scheduleId)
            : null;
          if (item) {
            setForm((f) => ({
              ...f,
              equipmentId: item.equipmentId,
              type: item.activityType === "INS" ? "INSPECTION" : "PREVENTIVE",
              plannedDate: item.plannedDate,
              title: `${item.activityType === "INS" ? "Inspection" : "PM"} — ${item.equipmentName}`,
              description: item.taskDescription || "",
            }));
          }
        } else if (presetEquipmentId) {
          const eq = eqList.find((e) => e.id === presetEquipmentId);
          if (eq)
            setForm((f) => ({
              ...f,
              equipmentId: eq.id,
              title: `PM — ${eq.name}`,
            }));
        }
      } catch {
        setError("Failed to load form data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scheduleId, presetEquipmentId]);

  // Auto-title when equipment/type changes and title is empty or auto-derived
  const onEquipmentChange = (id: string) => {
    const eq = equipment.find((e) => e.id === id);
    setForm((f) => ({
      ...f,
      equipmentId: id,
      title: eq ? `${WO_TYPE_LABELS[f.type]} — ${eq.name}` : f.title,
      priority:
        eq?.criticality === "HIGH" || eq?.criticality === "CRITICAL" ? "HIGH" : f.priority,
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.equipmentId || !form.title) {
      setError("Equipment and title are required");
      return;
    }
    setSaving(true);
    try {
      const tech = users.find((u) => u.id === form.technicianId);
      const res = await fetch("/api/work-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          technicianName: tech?.name || null,
          createdByName: "Daniel Idonor",
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Failed to create work order");
      }
      const wo = await res.json();
      router.push(`/work-orders/${wo.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create work order");
      setSaving(false);
    }
  };

  const field = "w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/40";
  const labelCls = "block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <AppHeader />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-6">
        <Link href="/work-orders" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to work orders
        </Link>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <ClipboardList className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">New Work Order</h2>
            <p className="text-xs text-slate-500 font-mono">
              {scheduleId ? "Raised from a scheduled activity" : "Manual work order"}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="py-16 flex justify-center items-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-xs ml-2 font-mono">Loading…</span>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 bg-white border border-slate-200 rounded-xl p-6">
            {error && (
              <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <div>
              <label className={labelCls}>Equipment *</label>
              <select
                value={form.equipmentId}
                onChange={(e) => onEquipmentChange(e.target.value)}
                className={field}
                required
              >
                <option value="">Select equipment…</option>
                {equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.assetId} — {e.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Type *</label>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  className={field}
                >
                  {WO_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{WO_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className={field}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Quarterly PM — Sertom Plate Rolling Machine"
                className={field}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Planned Date</label>
                <input
                  type="date"
                  value={form.plannedDate}
                  onChange={(e) => setForm((f) => ({ ...f, plannedDate: e.target.value }))}
                  className={field}
                />
              </div>
              <div>
                <label className={labelCls}>Assigned Technician</label>
                <select
                  value={form.technicianId}
                  onChange={(e) => setForm((f) => ({ ...f, technicianId: e.target.value }))}
                  className={field}
                >
                  <option value="">Unassigned</option>
                  {users
                    .filter((u) => u.role === "TECHNICIAN" || u.role === "SUPERVISOR")
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelCls}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Scope of work, notes…"
                className={field}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Link
                href="/work-orders"
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? "Creating…" : "Create Work Order"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}

export default function NewWorkOrderPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
        </div>
      }
    >
      <NewWorkOrderForm />
    </Suspense>
  );
}
