// src/app/work-orders/new/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, Loader2, Save } from "lucide-react";
import Select from "@/components/Select";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
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
          // creator is stamped from the session server-side
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-6">
        <PageHeader
          icon={ClipboardList}
          title="New Work Order"
          subtitle={scheduleId ? "Raised from a scheduled activity" : "Manually raised work order"}
          backHref="/work-orders"
          backLabel="Back to work orders"
        />

        {loading ? (
          <div className="py-16 flex justify-center items-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-xs ml-2">Loading…</span>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 bg-white border border-slate-200 rounded-xl p-6">
            {error && (
              <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 text-xs">
                {error}
              </div>
            )}

            <div>
              <label className={LABEL_CLASS}>Equipment *</label>
              <Select
                value={form.equipmentId}
                onChange={(v) => onEquipmentChange(v)}
                className="w-full"
                required
              >
                <option value="">Select equipment…</option>
                {equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.assetId} — {e.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Type *</label>
                <Select
                  value={form.type}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, type: v }))
                  }
                  className="w-full"
                >
                  {WO_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{WO_TYPE_LABELS[t]}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Priority</label>
                <Select
                  value={form.priority}
                  onChange={(v) => setForm((f) => ({ ...f, priority: v }))}
                  className="w-full"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Quarterly PM — Sertom Plate Rolling Machine"
                className={FIELD_CLASS}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Planned Date</label>
                <input
                  type="date"
                  value={form.plannedDate}
                  onChange={(e) => setForm((f) => ({ ...f, plannedDate: e.target.value }))}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Assigned Technician</label>
                <Select
                  value={form.technicianId}
                  onChange={(v) => setForm((f) => ({ ...f, technicianId: v }))}
                  className="w-full"
                >
                  <option value="">Unassigned</option>
                  {users
                    .filter((u) => u.role === "TECHNICIAN" || u.role === "FOREMAN")
                    .map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </Select>
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Scope of work, notes…"
                className={FIELD_CLASS}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" href="/work-orders">
                Cancel
              </Button>
              <Button type="submit" icon={Save} disabled={saving} loading={saving}>
                {saving ? "Creating…" : "Create Work Order"}
              </Button>
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
