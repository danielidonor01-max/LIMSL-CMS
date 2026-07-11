// src/app/calibration/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Gauge, Loader2, CheckCircle2, Clock, AlertTriangle, Plus, RotateCw } from "lucide-react";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import Modal from "@/components/Modal";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { toast } from "sonner";

type Cal = {
  id: string;
  instrumentName: string;
  serialNumber: string | null;
  make: string | null;
  model: string | null;
  lastCalibrationDate: string | null;
  nextCalibrationDate: string | null;
  calibrationInterval: number | null;
  calibratedBy: string | null;
  certificateNumber: string | null;
  status: string | null;
};

const TODAY = new Date().toISOString().slice(0, 10);
const inputCls =
  "w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none";
const labelCls = "text-[11px] font-semibold text-slate-500 uppercase";

const STATUS_BADGE: Record<string, string> = {
  CURRENT: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  DUE_SOON: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  OUT_OF_SERVICE: "bg-slate-500/10 text-slate-500 border-slate-500/20",
};
const STATUS_LABEL: Record<string, string> = {
  CURRENT: "Current",
  DUE_SOON: "Due Soon",
  OVERDUE: "Overdue",
  OUT_OF_SERVICE: "Out of Service",
};

const daysUntil = (d: string | null) =>
  d ? Math.round((new Date(d).getTime() - Date.now()) / 864e5) : null;

export default function CalibrationPage() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const canWrite = MAINTENANCE_WRITE_ROLES.includes(role ?? "");

  const [rows, setRows] = useState<Cal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // null = closed; {} = new instrument; {id,...} = recalibrate existing
  const [editing, setEditing] = useState<Partial<Cal> | null>(null);

  async function loadData() {
    try {
      const res = await fetch("/api/calibration");
      const d = res.ok ? await res.json() : [];
      setRows(Array.isArray(d) ? d : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function submitCalibration(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const res = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing?.id || undefined,
          instrumentName: fd.get("instrumentName"),
          serialNumber: fd.get("serialNumber"),
          make: fd.get("make"),
          model: fd.get("model"),
          lastCalibrationDate: fd.get("lastCalibrationDate") || TODAY,
          calibrationInterval: fd.get("calibrationInterval") ? Number(fd.get("calibrationInterval")) : 365,
          calibratedBy: fd.get("calibratedBy"),
          certificateNumber: fd.get("certificateNumber"),
        }),
      });
      if (res.ok) {
        toast.success(editing?.id ? "Calibration recorded — dates rolled forward." : "Instrument registered.");
        setEditing(null);
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to record calibration.");
      }
    } finally {
      setSaving(false);
    }
  }

  const summary = useMemo(() => {
    const c = { CURRENT: 0, DUE_SOON: 0, OVERDUE: 0 } as Record<string, number>;
    rows.forEach((r) => (c[r.status ?? "CURRENT"] = (c[r.status ?? "CURRENT"] ?? 0) + 1));
    return c;
  }, [rows]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Calibration Management</h2>
              <p className="text-xs text-slate-500 font-mono">
                Measuring instrument register · semi-annual / annual cycle
              </p>
            </div>
          </div>
          {canWrite && (
            <button
              onClick={() => setEditing({})}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
            >
              <Plus className="w-4 h-4" /> Record Calibration
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-24 flex justify-center items-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span className="text-xs ml-2 font-mono">Loading calibration register…</span>
          </div>
        ) : (
          <>
            {summary.OVERDUE > 0 && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/5 text-rose-700 text-xs">
                <AlertTriangle className="w-4 h-4 animate-pulse" />
                {summary.OVERDUE} instrument{summary.OVERDUE > 1 ? "s are" : " is"} overdue for calibration — raise a non-conformity and schedule immediately.
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <Stat icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} label="Current" value={summary.CURRENT ?? 0} tone="border-emerald-500/15 bg-emerald-500/5" />
              <Stat icon={<Clock className="w-4 h-4 text-amber-600" />} label="Due Soon" value={summary.DUE_SOON ?? 0} tone="border-amber-500/15 bg-amber-500/5" />
              <Stat icon={<AlertTriangle className="w-4 h-4 text-rose-600" />} label="Overdue" value={summary.OVERDUE ?? 0} tone="border-rose-500/15 bg-rose-500/5" />
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-3 px-5 font-medium">Instrument</th>
                      <th className="py-3 px-4 font-medium">Make / Model</th>
                      <th className="py-3 px-4 font-medium">Last Cal.</th>
                      <th className="py-3 px-4 font-medium">Next Cal.</th>
                      <th className="py-3 px-4 font-medium">Interval</th>
                      <th className="py-3 px-4 font-medium">Certificate</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      {canWrite && <th className="py-3 px-4 font-medium"></th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rows.map((r) => {
                      const d = daysUntil(r.nextCalibrationDate);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="py-3 px-5">
                            <div className="font-medium text-slate-900">{r.instrumentName}</div>
                            {r.serialNumber && (
                              <div className="text-[10px] font-mono text-slate-500">S/N {r.serialNumber}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-700">
                            {r.make} {r.model}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500">{formatDate(r.lastCalibrationDate)}</td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {formatDate(r.nextCalibrationDate)}
                            {d !== null && (
                              <span className={`ml-1 ${d < 0 ? "text-rose-600" : d < 30 ? "text-amber-600" : "text-slate-500"}`}>
                                ({d < 0 ? `${-d}d ago` : `${d}d`})
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-500">{r.calibrationInterval ?? "—"} d</td>
                          <td className="py-3 px-4 font-mono text-slate-500">{r.certificateNumber ?? "—"}</td>
                          <td className="py-3 px-4">
                            <Badge className={STATUS_BADGE[r.status ?? "CURRENT"]}>
                              {STATUS_LABEL[r.status ?? "CURRENT"]}
                            </Badge>
                          </td>
                          {canWrite && (
                            <td className="py-3 px-4">
                              <button
                                onClick={() => setEditing(r)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                              >
                                <RotateCw className="w-3.5 h-3.5" /> Recalibrate
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Record Calibration" : "Register Instrument"}
        subtitle={editing?.id ? `Roll ${editing.instrumentName ?? "instrument"} forward` : "New measuring instrument"}
      >
        <form onSubmit={submitCalibration} className="space-y-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Instrument Name</label>
            <input name="instrumentName" required defaultValue={editing?.instrumentName ?? ""} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}>Serial Number</label>
              <input name="serialNumber" defaultValue={editing?.serialNumber ?? ""} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Certificate No.</label>
              <input name="certificateNumber" defaultValue={editing?.certificateNumber ?? ""} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Make</label>
              <input name="make" defaultValue={editing?.make ?? ""} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Model</label>
              <input name="model" defaultValue={editing?.model ?? ""} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Calibration Date</label>
              <input name="lastCalibrationDate" type="date" defaultValue={TODAY} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Interval (days)</label>
              <input name="calibrationInterval" type="number" defaultValue={editing?.calibrationInterval ?? 365} className={inputCls} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Calibrated By</label>
            <input name="calibratedBy" defaultValue={editing?.calibratedBy ?? ""} className={inputCls} placeholder="Lab / technician" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save Calibration
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className={`p-4 rounded-xl border ${tone}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold mt-2 text-slate-900">{value}</div>
    </div>
  );
}
