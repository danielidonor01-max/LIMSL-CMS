// src/app/equipment/new/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Layers, RefreshCw } from "lucide-react";
import Select from "@/components/Select";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import LocationField from "@/components/LocationField";
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

  return (
    <div className="p-6 max-w-3xl w-full mx-auto space-y-6">
      <PageHeader
        icon={Layers}
        title="Add New Equipment"
        subtitle="The asset ID is generated for you — edit it before saving if you need to"
        backHref="/equipment"
        backLabel="Back to registry"
      />

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {/* Auto-generated Asset ID */}
        <div>
          <label className={LABEL_CLASS}>Asset ID (auto-generated)</label>
          <div className="flex gap-2">
            <input
              value={form.assetId}
              onChange={(e) => set("assetId", e.target.value)}
              placeholder="LEE/PE/0000"
              className={`${FIELD_CLASS} font-mono`}
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
          <label className={LABEL_CLASS}>Equipment Name *</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} className={FIELD_CLASS} required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Category</label>
            <Select value={form.category} onChange={(v) => set("category", v)} className="w-full">
              {Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Status</label>
            <Select value={form.status} onChange={(v) => set("status", v)} className="w-full">
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Location</label>
            <LocationField value={form.location} onChange={(v) => set("location", v)} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Bay</label>
            <input value={form.bay} onChange={(e) => set("bay", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>OEM / Vendor</label>
            <input value={form.oem} onChange={(e) => set("oem", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Model</label>
            <input value={form.model} onChange={(e) => set("model", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Serial Number</label>
            <input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Commissioning Date</label>
            <input type="date" value={form.commissioningDate} onChange={(e) => set("commissioningDate", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Maintenance Frequency</label>
            <Select value={form.maintenanceFrequency} onChange={(v) => set("maintenanceFrequency", v)} className="w-full">
              {FREQUENCIES.map((fq) => <option key={fq} value={fq}>{fq.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <div>
            <label className={LABEL_CLASS}>Criticality</label>
            <Select value={form.criticality} onChange={(v) => set("criticality", v)} className="w-full">
              {CRITICALITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" href="/equipment">
            Cancel
          </Button>
          <Button type="submit" icon={Save} disabled={saving} loading={saving}>
            Add Equipment
          </Button>
        </div>
      </form>
    </div>
  );
}
