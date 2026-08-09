// src/components/ConditionCard.tsx
"use client";

import { useEffect, useState } from "react";
import { Activity, Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { toast } from "sonner";
import Button from "./Button";
import Modal from "./Modal";
import Select from "./Select";
import Field, { FIELD_CLASS, LABEL_CLASS } from "./Field";
import { Badge } from "./Badge";
import { formatDate } from "@/lib/utils";
import {
  CONDITION_LABELS,
  CONDITION_UNITS,
  VERDICT_LABELS,
  VERDICT_BADGE,
  type ConditionKind,
  type ConditionVerdict,
} from "@/lib/maintenance/condition";

type Point = {
  id: string;
  name: string;
  kind: ConditionKind;
  unit: string | null;
  alertLimit: number | null;
  alarmLimit: number | null;
  lastReadingDate: string | null;
  latest: { value: number; takenOn: string; takenByName: string | null } | null;
  verdict: ConditionVerdict;
  trend: { direction: string; changePerMonth: number | null; projectedAlarmDate: string | null };
  readings: { id: string; value: number; takenOn: string; verdict: string }[];
};

export default function ConditionCard({ equipmentId, canWrite }: { equipmentId: string; canWrite: boolean }) {
  const [data, setData] = useState<{ points: Point[]; health: any } | null>(null);
  const [addPoint, setAddPoint] = useState(false);
  const [reading, setReading] = useState<{ point: Point; value: string; takenOn: string; notes: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    kind: "TEMPERATURE" as ConditionKind,
    alertLimit: "",
    alarmLimit: "",
    intervalDays: "90",
  });

  const load = () => {
    fetch(`/api/equipment/${equipmentId}/condition`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && !d.error && setData(d));
  };
  useEffect(load, [equipmentId]);

  if (!data) return null;
  if (!data.points.length && !canWrite) return null;

  const post = async (body: unknown, ok: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/equipment/${equipmentId}/condition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed.");
        return null;
      }
      toast.success(ok);
      load();
      return d;
    } finally {
      setSaving(false);
    }
  };

  const TrendIcon = ({ dir }: { dir: string }) =>
    dir === "RISING" ? (
      <TrendingUp className="w-3.5 h-3.5 text-rose-600" />
    ) : dir === "FALLING" ? (
      <TrendingDown className="w-3.5 h-3.5 text-emerald-600" />
    ) : (
      <Minus className="w-3.5 h-3.5 text-slate-400" />
    );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          Condition monitoring
        </h3>
        {canWrite && (
          <Button variant="secondary" size="sm" icon={Plus} onClick={() => setAddPoint(true)}>
            Add point
          </Button>
        )}
      </div>

      {!data.points.length ? (
        <p className="text-xs text-slate-500 leading-relaxed">
          Nothing is being measured on this machine. A thermography or vibration point only earns its place if
          somebody takes the reading on a schedule, add one when you have decided who and how often, not before.
        </p>
      ) : (
        <>
          {!data.health.keptUp && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
              {data.health.overdue > 0 && `${data.health.overdue} point(s) overdue a reading. `}
              {data.health.neverRead > 0 && `${data.health.neverRead} never read. `}
              Readings taken irregularly cannot show a trend, which is the only thing this catches early.
            </p>
          )}

          <div className="space-y-3">
            {data.points.map((p) => (
              <div key={p.id} className="border border-slate-200 rounded-lg p-3 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900">{p.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {CONDITION_LABELS[p.kind] ?? p.kind}
                      {p.alertLimit !== null ? ` · alert ${p.alertLimit}${p.unit ?? ""}` : ""}
                      {p.alarmLimit !== null ? ` · alarm ${p.alarmLimit}${p.unit ?? ""}` : ""}
                    </p>
                  </div>
                  <Badge className={VERDICT_BADGE[p.verdict]}>{VERDICT_LABELS[p.verdict]}</Badge>
                </div>

                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">
                    {p.latest ? p.latest.value : "-"}
                    <span className="text-xs text-slate-500 font-normal"> {p.unit}</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {p.latest ? `read ${formatDate(p.latest.takenOn)}` : "no reading yet"}
                  </span>
                  {p.trend.direction !== "UNKNOWN" && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600">
                      <TrendIcon dir={p.trend.direction} />
                      {p.trend.direction === "STABLE"
                        ? "stable"
                        : `${p.trend.changePerMonth! > 0 ? "+" : ""}${p.trend.changePerMonth} ${p.unit}/month`}
                    </span>
                  )}
                </div>

                {/* The number worth the whole feature. */}
                {p.trend.projectedAlarmDate && (
                  <p className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">
                    At this rate it reaches the alarm level around{" "}
                    <strong>{formatDate(p.trend.projectedAlarmDate)}</strong>, every reading so far is still within
                    limits.
                  </p>
                )}

                {canWrite && (
                  <button
                    onClick={() =>
                      setReading({ point: p, value: "", takenOn: new Date().toISOString().slice(0, 10), notes: "" })
                    }
                    className="text-[11px] font-semibold text-indigo-700 hover:underline"
                  >
                    Record a reading
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add a point */}
      <Modal open={addPoint} onClose={() => setAddPoint(false)} title="Add a measurement point" subtitle="Two thresholds: alert means plan, alarm means stop">
        <div className="space-y-4">
          <Field label="What is being measured" htmlFor="cp-name">
            <input
              id="cp-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Motor drive-end bearing"
              className={FIELD_CLASS}
            />
          </Field>
          <div>
            <label className={LABEL_CLASS}>Measurement type</label>
            <Select
              value={form.kind}
              onChange={(v) => setForm((f) => ({ ...f, kind: v as ConditionKind }))}
              className="w-full"
            >
              {(Object.keys(CONDITION_LABELS) as ConditionKind[]).map((k) => (
                <option key={k} value={k}>
                  {CONDITION_LABELS[k]} ({CONDITION_UNITS[k]})
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Alert at" htmlFor="cp-alert">
              <input id="cp-alert" inputMode="decimal" value={form.alertLimit} onChange={(e) => setForm((f) => ({ ...f, alertLimit: e.target.value }))} className={FIELD_CLASS} />
            </Field>
            <Field label="Alarm at" htmlFor="cp-alarm">
              <input id="cp-alarm" inputMode="decimal" value={form.alarmLimit} onChange={(e) => setForm((f) => ({ ...f, alarmLimit: e.target.value }))} className={FIELD_CLASS} />
            </Field>
            <Field label="Read every (days)" htmlFor="cp-int">
              <input id="cp-int" inputMode="numeric" value={form.intervalDays} onChange={(e) => setForm((f) => ({ ...f, intervalDays: e.target.value }))} className={FIELD_CLASS} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddPoint(false)}>Cancel</Button>
            <Button
              type="button"
              loading={saving}
              onClick={async () => {
                if (!form.name.trim()) {
                  toast.error("Name the measurement point.");
                  return;
                }
                if (await post(form, "Measurement point added.")) {
                  setAddPoint(false);
                  setForm({ name: "", kind: "TEMPERATURE", alertLimit: "", alarmLimit: "", intervalDays: "90" });
                }
              }}
            >
              Add point
            </Button>
          </div>
        </div>
      </Modal>

      {/* Record a reading */}
      <Modal
        open={!!reading}
        onClose={() => setReading(null)}
        title="Record a reading"
        subtitle={reading ? reading.point.name : ""}
      >
        {reading && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={`Value (${reading.point.unit ?? ""})`} htmlFor="cr-val">
                <input id="cr-val" inputMode="decimal" value={reading.value} onChange={(e) => setReading((s) => (s ? { ...s, value: e.target.value } : s))} className={FIELD_CLASS} />
              </Field>
              <Field label="Taken on" htmlFor="cr-date">
                <input id="cr-date" type="date" max={new Date().toISOString().slice(0, 10)} value={reading.takenOn} onChange={(e) => setReading((s) => (s ? { ...s, takenOn: e.target.value } : s))} className={FIELD_CLASS} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="cr-notes">
              <input id="cr-notes" value={reading.notes} onChange={(e) => setReading((s) => (s ? { ...s, notes: e.target.value } : s))} className={FIELD_CLASS} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReading(null)}>Cancel</Button>
              <Button
                type="button"
                loading={saving}
                onClick={async () => {
                  const d = await post(
                    { kind: "READING", pointId: reading.point.id, value: reading.value, takenOn: reading.takenOn, notes: reading.notes },
                    "Reading recorded.",
                  );
                  if (d) {
                    if (d.verdict === "ALARM") toast.error("Above the alarm level, intervene now.");
                    else if (d.verdict === "ALERT") toast.warning("Above the alert level, plan an intervention.");
                    setReading(null);
                  }
                }}
              >
                Record
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
