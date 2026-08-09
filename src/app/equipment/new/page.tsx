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
import {
  CRITICALITY_LABELS,
  CRITICALITY_SHORT,
  FREQUENCY_LABELS,
} from "@/lib/constants";
import { ASSET_PREFIXES, ASSET_PREFIX_META, type AssetPrefix } from "@/lib/asset-id";
import { suggestedPmFrequency } from "@/lib/maintenance/adherence";

const FREQUENCIES = ["MONTHLY", "BI_MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"];
const CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// A facility system is maintained as an installation, not a unit, so the
// categories on offer differ from a machine's.
const SYSTEM_CATEGORIES = ["SYSTEM", "ELECTRICAL_PANEL", "EARTHING", "FACILITY_AC", "OTHER"];

export default function NewEquipmentPage() {
  const router = useRouter();
  const [genLoading, setGenLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [assetType, setAssetType] = useState<AssetPrefix>("PE");
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

  const generateId = async (prefix: AssetPrefix) => {
    setGenLoading(true);
    try {
      const { nextAssetId } = await fetch(`/api/equipment/next-id?prefix=${prefix}`).then((r) =>
        r.json(),
      );
      setForm((f) => ({ ...f, assetId: nextAssetId }));
    } finally {
      setGenLoading(false);
    }
  };

  useEffect(() => {
    generateId(assetType);
  }, [assetType]);

  // Switching type re-numbers from the other series and moves the category to
  // one that belongs to it, so the two never disagree.
  const chooseType = (next: AssetPrefix) => {
    if (next === assetType) return;
    setAssetType(next);
    setForm((f) => ({
      ...f,
      category: next === "SYS" ? "SYSTEM" : "CNC_HEAVY",
      criticality: next === "SYS" ? "HIGH" : f.criticality,
    }));
  };

  const categoryOptions = Object.entries(EQUIPMENT_CATEGORY_LABELS).filter(([k]) =>
    assetType === "SYS" ? SYSTEM_CATEGORIES.includes(k) : !SYSTEM_CATEGORIES.includes(k) || k === "OTHER",
  );

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
        title="Add to the Asset Register"
        subtitle="What you are adding decides how it is numbered and maintained"
        backHref="/equipment"
        backLabel="Back to registry"
      />

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        {/* What kind of asset, decided first, because it drives everything below */}
        <fieldset>
          <legend className={LABEL_CLASS}>What are you adding?</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            {ASSET_PREFIXES.map((p) => {
              const active = assetType === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={active}
                  onClick={() => chooseType(p)}
                  className={`text-left p-4 rounded-xl border transition-colors ${
                    active
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded ${
                        active ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {p}
                    </span>
                    <span className={`text-sm font-semibold ${active ? "text-emerald-900" : "text-slate-700"}`}>
                      {ASSET_PREFIX_META[p].label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                    {ASSET_PREFIX_META[p].help}
                  </p>
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Asset ID, numbered within the chosen series */}
        <div>
          <label className={LABEL_CLASS}>Asset ID (auto-generated)</label>
          <div className="flex gap-2">
            <input
              value={form.assetId}
              onChange={(e) => set("assetId", e.target.value)}
              placeholder={`LEE/${assetType}/0000`}
              className={`${FIELD_CLASS} font-mono`}
              required
            />
            <button
              type="button"
              onClick={() => generateId(assetType)}
              disabled={genLoading}
              title="Generate next available code"
              className="inline-flex items-center gap-1.5 px-3 min-h-11 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 shrink-0"
            >
              {genLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Regenerate
            </button>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            Next free code in the LEE/{assetType}/ series. Editable, a duplicate is refused on save.
          </p>
        </div>

        <div>
          <label className={LABEL_CLASS}>
            {assetType === "SYS" ? "System Name *" : "Equipment Name *"}
          </label>
          <input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder={assetType === "SYS" ? "e.g. Workshop Earthing Installation" : "e.g. CNC Plasma Cutting Machine"}
            className={FIELD_CLASS}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL_CLASS}>Category</label>
            <Select value={form.category} onChange={(v) => set("category", v)} className="w-full">
              {categoryOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
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
            <label className={LABEL_CLASS}>
              {assetType === "SYS" ? "Installer / Contractor" : "OEM / Vendor"}
            </label>
            <input value={form.oem} onChange={(e) => set("oem", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>
              {assetType === "SYS" ? "Rating / Specification" : "Model"}
            </label>
            <input value={form.model} onChange={(e) => set("model", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>
              {assetType === "SYS" ? "Drawing / Reference No." : "Serial Number"}
            </label>
            <input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>
              {assetType === "SYS" ? "Installation Date" : "Commissioning Date"}
            </label>
            <input type="date" value={form.commissioningDate} onChange={(e) => set("commissioningDate", e.target.value)} className={FIELD_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>How critical is it?</label>
            <Select value={form.criticality} onChange={(v) => set("criticality", v)} className="w-full">
              {CRITICALITIES.map((c) => <option key={c} value={c}>{CRITICALITY_LABELS[c]}</option>)}
            </Select>
            <p className="text-[10px] text-slate-500 mt-1">
              Sets the default service interval, work-order priority and how early overdue work escalates.
            </p>
          </div>
          <div>
            <label className={LABEL_CLASS}>Service interval</label>
            <Select value={form.maintenanceFrequency} onChange={(v) => set("maintenanceFrequency", v)} className="w-full">
              {FREQUENCIES.map((fq) => <option key={fq} value={fq}>{FREQUENCY_LABELS[fq] ?? fq}</option>)}
            </Select>
            {form.maintenanceFrequency !== suggestedPmFrequency(form.criticality) && (
              <p className="text-[10px] text-amber-700 mt-1">
                {CRITICALITY_SHORT[form.criticality]} criticality normally means{" "}
                {(FREQUENCY_LABELS[suggestedPmFrequency(form.criticality)] ?? "").toLowerCase()}.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" href="/equipment">
            Cancel
          </Button>
          <Button type="submit" icon={Save} disabled={saving} loading={saving}>
            {assetType === "SYS" ? "Add Facility System" : "Add Equipment"}
          </Button>
        </div>
      </form>
    </div>
  );
}
