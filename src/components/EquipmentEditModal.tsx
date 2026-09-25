// src/components/EquipmentEditModal.tsx
// Editing a machine's details without leaving the page you were on.
//
// This was a page of its own, which meant correcting a serial number on the
// register took you away from the register and back again. It is a modal now,
// opened from the register row and from the machine's own page alike.
//
// One field is no longer editable here: the maintenance interval. It belongs to
// the category, so it is shown rather than chosen, and the only way to change a
// machine's interval is to move it to another category — or to change the
// category's, in Settings, where it is signed off.
"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import Toggle from "@/components/Toggle";
import LocationField from "@/components/LocationField";
import Field, { FIELD_CLASS } from "@/components/Field";
import { EQUIPMENT_CATEGORY_LABELS, EQUIPMENT_STATUS_LABELS, FREQUENCY_LABELS } from "@/lib/constants";
import { invalidateApi } from "@/lib/api-cache";

const CRITICALITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

type Category = { code: string; label: string; maintenanceFrequency: string };

export default function EquipmentEditModal({
  assetKey,
  open,
  onClose,
  onSaved,
}: {
  /** The asset's URL key (LEE-PE-0158) or id. */
  assetKey: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: (saved: { assetId: string; id: string }) => void;
}) {
  const [form, setForm] = useState<any>(null);
  const [original, setOriginal] = useState<any>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !assetKey) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/equipment/${assetKey}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/asset-categories").then((r) => (r.ok ? r.json() : { categories: [] })),
    ])
      .then(([asset, cats]) => {
        setForm(asset);
        setOriginal(asset);
        setCategories(Array.isArray(cats?.categories) ? cats.categories : []);
      })
      .finally(() => setLoading(false));
  }, [open, assetKey]);

  const set = (k: string, v: unknown) => setForm((f: any) => ({ ...f, [k]: v }));

  // The register's categories, falling back to the built-ins before the
  // categories table exists so the form never offers an empty list.
  const options: Category[] = useMemo(() => {
    if (categories.length) return categories;
    return Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([code, label]) => ({
      code,
      label,
      maintenanceFrequency: "",
    }));
  }, [categories]);

  const chosen = options.find((c) => c.code === form?.category);
  const movingCategory = !!original && form?.category !== original.category;
  const newInterval = chosen?.maintenanceFrequency || form?.maintenanceFrequency;
  const intervalChanges = movingCategory && newInterval && newInterval !== original?.maintenanceFrequency;

  const save = async () => {
    if (!form || !assetKey) return;
    setSaving(true);
    try {
      // The interval is the category's, so it is not sent: the server derives it.
      const { maintenanceFrequency: _ignored, ...body } = form;
      void _ignored;
      const res = await fetch(`/api/equipment/${assetKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not save the changes.");
        return;
      }
      invalidateApi("/api/equipment");
      invalidateApi(`/api/equipment/${assetKey}`);
      toast.success(
        intervalChanges
          ? `Saved. ${form.name} now follows ${chosen?.label ?? "its new category"} and its future plan was rebuilt.`
          : "Saved.",
      );
      const saved = Array.isArray(d) ? d[0] : d;
      onSaved?.({ assetId: saved?.assetId ?? form.assetId, id: saved?.id ?? form.id });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit details"
      subtitle={form ? `${form.assetId} · ${form.name}` : undefined}
    >
      {loading || !form ? (
        <div className="py-10 grid place-items-center text-ink-500">
          <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
        </div>
      ) : form.error ? (
        <p className="text-sm text-ink-500 py-6 text-center">This asset could not be found.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Asset ID" htmlFor="eq-asset-id">
            <input
              id="eq-asset-id"
              value={form.assetId ?? ""}
              onChange={(e) => set("assetId", e.target.value)}
              className={FIELD_CLASS}
              placeholder="LEE/PE/0000"
            />
            <p className="text-xs text-ink-500 mt-1">Changing the code re-keys this asset across the register.</p>
          </Field>

          <Field label="Name" htmlFor="eq-name">
            <input
              id="eq-name"
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
              className={FIELD_CLASS}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Category" htmlFor="eq-category">
              <Select
                value={form.category ?? ""}
                onChange={(v) => set("category", v)}
                ariaLabel="Category"
                className="w-full"
              >
                {options.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Shown, not chosen. The interval is the category's. */}
            <Field label="Serviced" htmlFor="eq-interval">
              <div
                id="eq-interval"
                className={`${FIELD_CLASS} bg-ink-100 text-ink-700 cursor-default`}
                aria-readonly="true"
              >
                {newInterval ? (FREQUENCY_LABELS[newInterval] ?? newInterval) : "Not set"}
              </div>
              <p className="text-xs text-ink-500 mt-1">
                Set by the category. Changed in Settings, with sign-off.
              </p>
            </Field>

            <Field label="Status" htmlFor="eq-status">
              <Select
                value={form.status ?? ""}
                onChange={(v) => set("status", v)}
                ariaLabel="Status"
                className="w-full"
              >
                {Object.entries(EQUIPMENT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Criticality" htmlFor="eq-criticality">
              <Select
                value={form.criticality ?? "MEDIUM"}
                onChange={(v) => set("criticality", v)}
                ariaLabel="Criticality"
                className="w-full"
              >
                {CRITICALITIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0) + c.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Location" htmlFor="eq-location">
              <LocationField value={form.location ?? ""} onChange={(v) => set("location", v)} />
            </Field>
            <Field label="OEM / vendor" htmlFor="eq-oem">
              <input
                id="eq-oem"
                value={form.oem ?? ""}
                onChange={(e) => set("oem", e.target.value)}
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Model" htmlFor="eq-model">
              <input
                id="eq-model"
                value={form.model ?? ""}
                onChange={(e) => set("model", e.target.value)}
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Serial number" htmlFor="eq-serial">
              <input
                id="eq-serial"
                value={form.serialNumber ?? ""}
                onChange={(e) => set("serialNumber", e.target.value)}
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          {intervalChanges && (
            <p className="text-xs text-ink-600 rounded-lg border border-info-500/20 bg-info-500/5 px-3 py-2 leading-relaxed">
              Moving it to {chosen?.label} puts it on that category&apos;s interval —{" "}
              {(FREQUENCY_LABELS[newInterval] ?? newInterval).toLowerCase()} instead of{" "}
              {(FREQUENCY_LABELS[original?.maintenanceFrequency] ?? original?.maintenanceFrequency ?? "none").toLowerCase()}{" "}
              — and rebuilds its future planned activities. Overdue, deferred and started ones stay.
            </p>
          )}

          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <label className="flex items-center gap-2.5">
              <Toggle
                checked={!!form.requiresCalibration}
                onChange={(v) => set("requiresCalibration", v)}
                ariaLabel="Requires calibration"
              />
              <span className="text-sm text-ink-700">Requires calibration</span>
            </label>
            <label className="flex items-center gap-2.5">
              <Toggle
                checked={!!form.requiresPremob}
                onChange={(v) => set("requiresPremob", v)}
                ariaLabel="Requires pre-mobilization"
              />
              <span className="text-sm text-ink-700">Requires pre-mobilization</span>
            </label>
          </div>

          <Field label="Notes" htmlFor="eq-notes">
            <textarea
              id="eq-notes"
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
              className={FIELD_CLASS}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button loading={saving} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
