// src/app/equipment/new/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Layers, RefreshCw } from "lucide-react";
import {
  EQUIPMENT_CATEGORY_LABELS,
  EQUIPMENT_STATUS_LABELS,
} from "@/lib/constants";

const FREQUENCIES = ["MONTHLY", "BI_MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
const CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function NewEquipmentPage() {
  const router = useRouter();
  const [genLoading, setGenLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    assetId: "",
    name: "",
    category: "CNC_HEAVY",
    location: "Workshop",
    bay: "",
    oem: "",
    model: "",
    serialNumber: "",
    status: "OPERATIONAL",
    criticality: "MEDIUM",
    maintenanceFrequency: "QUARTERLY",
    commissioningDate: "",
    notes: "",
  });

  const generateId = async () => {
    setGenLoading(true);
    try {
      const { nextAssetId } = await fetch("/api/equipment/next-id").then((r) => r.json());
      setForm((f) => ({ ...f, assetId: nextAssetId }));
    } finally {
      setGenLoading(false);
    }
  };

  useEffect(() => {
    generateId();
  }, []);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assetId.trim() || !form.name.trim()) {
      toast.error("Asset ID and name are required.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error || "Failed to create equipment.");
      return;
    }
    toast.success(`Equipment ${form.assetId} added.`);
    router.push(`/equipment/${form.assetId.replace(/\//g, "-")}`);
  };

  const field = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:border-emerald-500/40";
  const label = "block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5";

  return (
    <div className="p-6 max-w-3xl w-full mx-auto space-y-6">
      <Link href="/equipment" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to registry
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
          <Layers className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900">Add New Equipment</h2>
          <p className="text-xs text-slate-500 font-mono">Asset ID is auto-generated — edit if needed</p>
        </div>
      </div>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {/* Auto-generated Asset ID */}
        <div>
          <label className={label}>Asset ID (auto-generated)</label>
          <div className="flex gap-2">
            <input
              value={form.assetId}
              onChange={(e) => set("assetId", e.target.value)}
              placeholder="LEE/PE/0000"
              className={`${field} font-mono`}
              required
            />
            <button
              type="button"
              onClick={generateId}
              disabled={genLoading}
              title="Generate next available code"
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 shrink-0"
            >
              {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Regenerate
            </button>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">Format LEE/PE/#### — editable before saving.</p>
        </div>

        <div>
          <label className={label}>Equipment Name *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={field} required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={label}>Category</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className={field}>
              {Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Status</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className={field}>
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Location</label>
            <input value={form.location} onChange={(e) => set("location", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Bay</label>
            <input value={form.bay} onChange={(e) => set("bay", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>OEM / Vendor</label>
            <input value={form.oem} onChange={(e) => set("oem", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Model</label>
            <input value={form.model} onChange={(e) => set("model", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Serial Number</label>
            <input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Commissioning Date</label>
            <input type="date" value={form.commissioningDate} onChange={(e) => set("commissioningDate", e.target.value)} className={field} />
          </div>
          <div>
            <label className={label}>Maintenance Frequency</label>
            <select value={form.maintenanceFrequency} onChange={(e) => set("maintenanceFrequency", e.target.value)} className={field}>
              {FREQUENCIES.map((fq) => <option key={fq} value={fq}>{fq.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Criticality</label>
            <select value={form.criticality} onChange={(e) => set("criticality", e.target.value)} className={field}>
              {CRITICALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/equipment" className="px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100">
            Cancel
          </Link>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Add Equipment
          </button>
        </div>
      </form>
    </div>
  );
}
