// src/app/calibration/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { Gauge, Loader2, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";

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
  const [rows, setRows] = useState<Cal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/calibration")
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const c = { CURRENT: 0, DUE_SOON: 0, OVERDUE: 0 } as Record<string, number>;
    rows.forEach((r) => (c[r.status ?? "CURRENT"] = (c[r.status ?? "CURRENT"] ?? 0) + 1));
    return c;
  }, [rows]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-6xl w-full mx-auto space-y-6">
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
