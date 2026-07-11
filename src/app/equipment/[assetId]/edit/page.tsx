// src/app/equipment/[assetId]/edit/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, Pencil } from "lucide-react";
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
} from "@/lib/constants";

const FREQUENCIES = ["MONTHLY", "BI_MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
const CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function EquipmentEditPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const router = useRouter();
  const [form, setForm] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/equipment/${assetId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setForm)
      .finally(() => setLoading(false));
  }, [assetId]);

  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/equipment/${assetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Failed to save changes.");
      return;
    }
    router.push(`/equipment/${assetId}`);
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (!form || form.error) {
    return (
      <div className="p-10 text-center text-slate-500">
        Equipment not found.{" "}
        <Link href="/equipment" className="text-emerald-600 hover:underline">Back</Link>
      </div>
    );
  }

  const field = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40";
  const label = "block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="p-6 max-w-3xl w-full mx-auto space-y-6">
      <Link href={`/equipment/${assetId}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to digital twin
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
          <Pencil className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Edit Equipment</h2>
          <p className="text-xs text-slate-500 font-mono">{form.assetId}</p>
        </div>
      </div>

      <form onSubmit={save} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {error && (
          <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-600 text-xs">{error}</div>
        )}

        <div>
          <label className={label}>Name</label>
          <input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} className={field} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Category</label>
            <select value={form.category ?? ""} onChange={(e) => set("category", e.target.value)} className={field}>
              {Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Status</label>
            <select value={form.status ?? ""} onChange={(e) => set("status", e.target.value)} className={field}>
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Location</label>
            <input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>OEM / Vendor</label>
            <input value={form.oem ?? ""} onChange={(e) => set("oem", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Model</label>
            <input value={form.model ?? ""} onChange={(e) => set("model", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Serial Number</label>
            <input value={form.serialNumber ?? ""} onChange={(e) => set("serialNumber", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Maintenance Frequency</label>
            <select value={form.maintenanceFrequency ?? ""} onChange={(e) => set("maintenanceFrequency", e.target.value)} className={field}>
              <option value="">—</option>
              {FREQUENCIES.map((f) => <option key={f} value={f}>{f.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Criticality</label>
            <select value={form.criticality ?? "MEDIUM"} onChange={(e) => set("criticality", e.target.value)} className={field}>
              {CRITICALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={!!form.requiresCalibration} onChange={(e) => set("requiresCalibration", e.target.checked)} className="accent-emerald-600 w-4 h-4" />
            Requires calibration
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={!!form.requiresPremob} onChange={(e) => set("requiresPremob", e.target.checked)} className="accent-emerald-600 w-4 h-4" />
            Requires pre-mobilization (premob)
          </label>
        </div>

        <div>
          <label className={label}>Notes</label>
          <textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} rows={3} className={field} />
        </div>

        <div className="flex justify-end gap-3">
          <Link href={`/equipment/${assetId}`} className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
