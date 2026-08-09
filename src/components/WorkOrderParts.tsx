// src/components/WorkOrderParts.tsx
// Parts issued against a job.
//
// The two halves existed and never met: the spares register could issue stock,
// and a PM checklist had a free-text "spare parts needed" box. Nothing linked
// them, so stock had to be remembered twice and the register could never answer
// what a machine actually consumes. spare_part_movements has carried a
// workOrderId column since the register was built; this is what finally sets it.
"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Button from "./Button";
import Modal from "./Modal";
import Select from "./Select";
import Field, { FIELD_CLASS, LABEL_CLASS } from "./Field";
import { type StockLevel } from "@/lib/maintenance/spares";

type Spare = {
  id: string;
  partNumber: string;
  name: string;
  quantityOnHand: number;
  unit: string | null;
  binLocation: string | null;
  equipmentId: string | null;
  risk: { level: StockLevel };
};

type Movement = {
  id: string;
  quantity: number;
  balanceAfter: number;
  reason: string | null;
  performedByName: string | null;
  createdAt: string;
  partNumber?: string;
  partName?: string;
};

export default function WorkOrderParts({
  workOrderId,
  equipmentId,
  canWrite,
}: {
  workOrderId: string;
  equipmentId?: string | null;
  canWrite: boolean;
}) {
  const [spares, setSpares] = useState<Spare[]>([]);
  const [used, setUsed] = useState<Movement[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ sparePartId: "", quantity: "1", reason: "" });

  const load = () => {
    Promise.all([
      fetch("/api/spares").then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/spares/movements?workOrderId=${workOrderId}`).then((r) => (r.ok ? r.json() : { movements: [] })),
    ])
      .then(([s, m]) => {
        setSpares(Array.isArray(s) ? s : []);
        setUsed(Array.isArray(m?.movements) ? m.movements : []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, [workOrderId]);

  if (loading) return null;
  if (!used.length && !canWrite) return null;

  // Parts held for this machine first. On a job you reach for that machine's
  // spares, not an alphabetical list of everything in the store.
  const sorted = [...spares].sort((a, b) => {
    const mine = (s: Spare) => (equipmentId && s.equipmentId === equipmentId ? 0 : 1);
    return mine(a) - mine(b) || a.name.localeCompare(b.name);
  });

  const submit = async () => {
    const qty = Number(form.quantity);
    if (!form.sparePartId || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Pick a part and a quantity.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/spares/${form.sparePartId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movementType: "ISSUE",
          quantity: qty,
          reason: form.reason.trim(),
          workOrderId,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not issue the part.");
        return;
      }
      toast.success(`Issued. ${d.balanceAfter} left on the shelf.`);
      setOpen(false);
      setForm({ sparePartId: "", quantity: "1", reason: "" });
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Package className="w-4 h-4 text-cyan-600" /> Parts used
        </h3>
        {canWrite && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setOpen(true)}>
            Issue a part
          </Button>
        )}
      </div>

      {!used.length ? (
        <p className="text-xs text-slate-500">
          Nothing issued to this job yet. Issuing here takes the part off the shelf and records it against the machine,
          so the register knows what it actually consumes.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {used.map((m) => (
            <li key={m.id} className="py-2 flex items-center justify-between gap-3 text-xs">
              <span className="min-w-0">
                <span className="font-medium text-slate-900">{m.partName ?? "Part"}</span>
                {m.partNumber && <span className="font-mono text-slate-500"> · {m.partNumber}</span>}
                {m.reason && <span className="block text-[11px] text-slate-500">{m.reason}</span>}
              </span>
              <span className="shrink-0 text-right">
                <span className="font-semibold text-slate-900">{Math.abs(m.quantity)}</span>
                <span className="block text-[10px] text-slate-400">{m.performedByName ?? ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Issue a part to this job" subtitle="Comes off the shelf and is recorded against the machine">
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Part</label>
            <Select
              value={form.sparePartId}
              onChange={(v) => setForm((f) => ({ ...f, sparePartId: v }))}
              className="w-full"
            >
              <option value="">Choose a part</option>
              {sorted.map((s) => (
                <option key={s.id} value={s.id} disabled={s.quantityOnHand <= 0}>
                  {s.name} ({s.partNumber}) · {s.quantityOnHand} {s.unit ?? "ea"}
                  {s.quantityOnHand <= 0 ? " · out of stock" : ""}
                  {equipmentId && s.equipmentId === equipmentId ? " · for this machine" : ""}
                </option>
              ))}
            </Select>
            {!spares.length && (
              <p className="text-[11px] text-amber-700 mt-1">
                Nothing on the spares register yet. Add parts there first.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity" htmlFor="wop-qty">
              <input
                id="wop-qty"
                inputMode="decimal"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Note" htmlFor="wop-note">
              <input
                id="wop-note"
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="Optional"
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" loading={saving} onClick={submit}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Issue part
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
