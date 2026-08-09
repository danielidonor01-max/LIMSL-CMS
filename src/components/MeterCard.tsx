// src/components/MeterCard.tsx
"use client";

import { useEffect, useState } from "react";
import { Gauge, Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import Button from "./Button";
import Modal from "./Modal";
import Select from "./Select";
import Field, { FIELD_CLASS } from "./Field";
import { Badge } from "./Badge";
import { formatDate } from "@/lib/utils";
import {
  METER_STATUS_LABELS,
  METER_STATUS_BADGE,
  METER_UNIT_LABELS,
  METER_UNIT_SHORT,
  type MeterUnit,
} from "@/lib/maintenance/meters";

type MeterData = {
  meterUnit: MeterUnit | null;
  currentMeter: number | null;
  meterUpdatedAt: string | null;
  meterServiceInterval: number | null;
  meterAtLastService: number | null;
  state: { status: keyof typeof METER_STATUS_LABELS; used: number; remaining: number; percent: number };
  usagePerDay: number | null;
  projectedDueDate: string | null;
  readings: { id: string; reading: number; readingDate: string; recordedByName: string | null; isReset: boolean | null }[];
};

export default function MeterCard({
  equipmentId,
  canWrite,
}: {
  equipmentId: string;
  canWrite: boolean;
}) {
  const [data, setData] = useState<MeterData | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    reading: "",
    readingDate: new Date().toISOString().slice(0, 10),
    meterUnit: "HOURS" as MeterUnit,
    meterServiceInterval: "",
    serviceDone: false,
    isReset: false,
    notes: "",
  });

  const load = () => {
    fetch(`/api/equipment/${equipmentId}/meter`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || d.error) return;
        setData(d);
        setForm((f) => ({
          ...f,
          meterUnit: d.meterUnit ?? "HOURS",
          meterServiceInterval: d.meterServiceInterval ? String(d.meterServiceInterval) : "",
        }));
      });
  };
  useEffect(load, [equipmentId]);

  if (!data) return null;

  const configured = data.currentMeter !== null || data.meterServiceInterval !== null;
  // Nothing set up and nobody able to set it up, don't take space on the page.
  if (!configured && !canWrite) return null;

  const unit = data.meterUnit ? METER_UNIT_SHORT[data.meterUnit] : "";
  const st = data.state;
  const barTone =
    st.status === "OVERDUE" || st.status === "DUE"
      ? "bg-rose-500"
      : st.status === "DUE_SOON"
        ? "bg-amber-500"
        : "bg-emerald-500";

  const submit = async () => {
    if (!form.reading.trim()) {
      toast.error("Enter the meter reading.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/equipment/${equipmentId}/meter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reading: Number(form.reading),
          readingDate: form.readingDate,
          meterUnit: form.meterUnit,
          meterServiceInterval: form.meterServiceInterval ? Number(form.meterServiceInterval) : undefined,
          serviceDone: form.serviceDone,
          isReset: form.isReset,
          notes: form.notes,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not record the reading.");
        return;
      }
      toast.success("Meter reading recorded.");
      setOpen(false);
      setForm((f) => ({ ...f, reading: "", notes: "", serviceDone: false, isReset: false }));
      load();
    } catch {
      toast.error("Could not record the reading.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-600" />
          Run-hours servicing
        </h3>
        {canWrite && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setOpen(true)}>
            Record reading
          </Button>
        )}
      </div>

      {!configured ? (
        <p className="text-xs text-slate-500 leading-relaxed">
          This machine is serviced by the calendar. For a compressor, crane or genset that is a proxy for how hard it
          actually works, record a meter reading and a service interval to schedule on real usage instead.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl font-bold text-slate-900 tabular-nums">
              {data.currentMeter ?? "-"}
            </span>
            <span className="text-xs text-slate-500">
              {data.meterUnit ? METER_UNIT_LABELS[data.meterUnit] : ""}
              {data.meterUpdatedAt ? ` · read ${formatDate(data.meterUpdatedAt)}` : ""}
            </span>
            <Badge className={METER_STATUS_BADGE[st.status]}>{METER_STATUS_LABELS[st.status]}</Badge>
          </div>

          {data.meterServiceInterval && st.status !== "NO_READING" && (
            <div className="space-y-1.5">
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full ${barTone} transition-all`} style={{ width: `${st.percent}%` }} />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>
                  {st.used} of {data.meterServiceInterval} {unit} since last service
                </span>
                <span className={st.remaining < 0 ? "text-rose-700 font-semibold" : ""}>
                  {st.remaining < 0
                    ? `${Math.abs(st.remaining)} ${unit} past due`
                    : `${st.remaining} ${unit} remaining`}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Actual usage</p>
              <p className="text-sm text-slate-900 mt-0.5">
                {data.usagePerDay !== null ? (
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                    {Math.round(data.usagePerDay * 10) / 10} {unit}/day
                  </span>
                ) : (
                  <span className="text-slate-400">Needs two readings</span>
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Projected due</p>
              <p className="text-sm text-slate-900 mt-0.5">
                {data.projectedDueDate ? (
                  formatDate(data.projectedDueDate)
                ) : (
                  <span className="text-slate-400">Not enough history</span>
                )}
              </p>
            </div>
          </div>

          {data.readings.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-900 select-none">
                {data.readings.length} recorded reading{data.readings.length === 1 ? "" : "s"}
              </summary>
              <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                {data.readings.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3 text-[11px] text-slate-600 py-1 border-b border-slate-50">
                    <span className="font-mono">{formatDate(r.readingDate)}</span>
                    <span className="tabular-nums">
                      {r.reading} {unit}
                      {r.isReset ? " · meter replaced" : ""}
                    </span>
                    <span className="text-slate-400 truncate">{r.recordedByName ?? "-"}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Record a meter reading"
        subtitle="Servicing follows how hard the machine has actually worked"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Reading" htmlFor="mtr-val">
              <input
                id="mtr-val"
                inputMode="decimal"
                value={form.reading}
                onChange={(e) => setForm((f) => ({ ...f, reading: e.target.value }))}
                placeholder={data.currentMeter !== null ? `Last was ${data.currentMeter}` : "e.g. 4200"}
                className={FIELD_CLASS}
              />
            </Field>
            <Field label="Date read" htmlFor="mtr-date">
              <input
                id="mtr-date"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.readingDate}
                onChange={(e) => setForm((f) => ({ ...f, readingDate: e.target.value }))}
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Meter measures</label>
              <Select
                value={form.meterUnit}
                onChange={(v) => setForm((f) => ({ ...f, meterUnit: v as MeterUnit }))}
                className="w-full mt-1.5"
              >
                {(Object.keys(METER_UNIT_LABELS) as MeterUnit[]).map((u) => (
                  <option key={u} value={u}>
                    {METER_UNIT_LABELS[u]}
                  </option>
                ))}
              </Select>
            </div>
            <Field label="Service every" htmlFor="mtr-int">
              <input
                id="mtr-int"
                inputMode="decimal"
                value={form.meterServiceInterval}
                onChange={(e) => setForm((f) => ({ ...f, meterServiceInterval: e.target.value }))}
                placeholder="e.g. 500"
                className={FIELD_CLASS}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.serviceDone}
              onChange={(e) => setForm((f) => ({ ...f, serviceDone: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-emerald-600"
            />
            <span>
              The service was carried out at this reading
              <span className="block text-slate-500 text-[11px]">Restarts the interval from here.</span>
            </span>
          </label>

          <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isReset}
              onChange={(e) => setForm((f) => ({ ...f, isReset: e.target.checked }))}
              className="mt-0.5 w-4 h-4 accent-emerald-600"
            />
            <span>
              The meter was replaced or reset
              <span className="block text-slate-500 text-[11px]">
                Allows a reading lower than the last one, and starts the usage rate again from here.
              </span>
            </span>
          </label>

          <Field label="Notes" htmlFor="mtr-notes">
            <input
              id="mtr-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={FIELD_CLASS}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" loading={saving} onClick={submit}>
              Record reading
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
