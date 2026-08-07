// src/app/calibration/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { invalidateApi, useApi } from "@/lib/api-cache";
import {
  Gauge,
  Loader2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  RotateCw,
  History,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import Button from "@/components/Button";
import Select from "@/components/Select";
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
  traceableTo: string | null;
  referenceStandardId: string | null;
  labName: string | null;
  labAccreditationNo: string | null;
  accreditationBody: string | null;
};

type CalEvent = {
  id: string;
  calibrationDate: string;
  nextCalibrationDate: string | null;
  asFound: string | null;
  asLeft: string | null;
  verdict: string;
  calibratedBy: string | null;
  certificateNumber: string | null;
  traceableTo: string | null;
  labName: string | null;
  labAccreditationNo: string | null;
  notes: string | null;
  createdAt: string | null;
};

const TODAY = new Date().toISOString().slice(0, 10);
const inputCls =
  "w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none";
const labelCls = "text-[11px] font-semibold text-slate-500 uppercase";
const sectionCls = "text-[11px] font-mono uppercase tracking-wider text-slate-500";

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

const AS_FOUND_LABEL: Record<string, string> = {
  IN_TOLERANCE: "As-found: in tolerance",
  OUT_OF_TOLERANCE: "As-found: OUT of tolerance",
  NOT_CHECKED: "As-found: not checked",
};
const AS_LEFT_LABEL: Record<string, string> = {
  IN_TOLERANCE: "As-left: in tolerance",
  ADJUSTED: "As-left: adjusted",
  REJECTED: "As-left: rejected",
};

const daysUntil = (d: string | null) =>
  d ? Math.round((new Date(d).getTime() - Date.now()) / 864e5) : null;

export default function CalibrationPage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");

  const { data: rowsData, loading, refresh } = useApi<Cal[]>("/api/calibration", []);
  const rows = Array.isArray(rowsData) ? rowsData : [];
  const [saving, setSaving] = useState(false);
  // null = closed; {} = new instrument; {id,...} = recalibrate existing
  const [editing, setEditing] = useState<Partial<Cal> | null>(null);
  const [asFound, setAsFound] = useState("NOT_CHECKED");
  const [asLeft, setAsLeft] = useState("IN_TOLERANCE");
  const [verdict, setVerdict] = useState("PASS");
  const [history, setHistory] = useState<Cal | null>(null);

  const { data: events, loading: eventsLoading } = useApi<CalEvent[]>(
    history ? `/api/calibration/${history.id}/events` : null,
    [],
  );

  useEffect(() => setMounted(true), []);

  function openForm(row: Partial<Cal>) {
    setAsFound("NOT_CHECKED");
    setAsLeft("IN_TOLERANCE");
    setVerdict("PASS");
    setEditing(row);
  }

  async function submitCalibration(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const traceableTo = String(fd.get("traceableTo") ?? "").trim();
    const labName = String(fd.get("labName") ?? "").trim();
    // Mirrors the server rule so the user is told before the round trip.
    if (!traceableTo && !labName) {
      toast.error(
        "Traceability is required (ISO 9001 7.1.5.2) — name the standard traced to, or the calibration laboratory.",
      );
      return;
    }
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
          calibrationDate: fd.get("calibrationDate") || TODAY,
          calibrationInterval: fd.get("calibrationInterval") ? Number(fd.get("calibrationInterval")) : 365,
          calibratedBy: fd.get("calibratedBy"),
          certificateNumber: fd.get("certificateNumber"),
          asFound,
          asLeft,
          verdict,
          traceableTo,
          referenceStandardId: fd.get("referenceStandardId"),
          labName,
          labAccreditationNo: fd.get("labAccreditationNo"),
          accreditationBody: fd.get("accreditationBody"),
          notes: fd.get("notes"),
        }),
      });
      if (res.ok) {
        const saved = await res.json().catch(() => null);
        const nc = saved?.nonConformity?.ncNumber as string | undefined;
        if (nc) {
          toast.warning(
            `Out of tolerance — ${nc} raised. The instrument is out of service; measurements taken since the last passing calibration must be assessed.`,
          );
        } else {
          toast.success(editing?.id ? "Calibration event recorded." : "Instrument registered.");
        }
        setEditing(null);
        invalidateApi("/api/calibration");
        refresh();
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
                Measuring instrument register · traceable calibration history
              </p>
            </div>
          </div>
          {canWrite && (
            <Button icon={Plus} onClick={() => openForm({})}>
              Record Calibration
            </Button>
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
                      <th className="py-3 px-4 font-medium">Certificate / Traceability</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-500">
                          <Gauge className="w-5 h-5 mx-auto mb-2 text-slate-400" />
                          <p className="text-xs">No measuring instruments registered yet.</p>
                          {canWrite && (
                            <p className="text-[11px] text-slate-400 mt-1">
                              Register the first one to start a traceable calibration history.
                            </p>
                          )}
                        </td>
                      </tr>
                    )}
                    {rows.map((r) => {
                      const d = daysUntil(r.nextCalibrationDate);
                      const traceability = r.traceableTo || r.labName;
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
                          <td className="py-3 px-4">
                            <div className="font-mono text-slate-500">{r.certificateNumber ?? "—"}</div>
                            {traceability ? (
                              <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="truncate max-w-[14rem]">{traceability}</span>
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                                <AlertTriangle className="w-3.5 h-3.5" /> No traceability on record
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <Badge className={STATUS_BADGE[r.status ?? "CURRENT"]}>
                              {STATUS_LABEL[r.status ?? "CURRENT"] ?? r.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={History}
                                onClick={() => setHistory(r)}
                                title={`Calibration history for ${r.instrumentName}`}
                              >
                                History
                              </Button>
                              {canWrite && (
                                <Button variant="ghost" size="sm" icon={RotateCw} onClick={() => openForm(r)}>
                                  Recalibrate
                                </Button>
                              )}
                            </div>
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

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Record Calibration" : "Register Instrument"}
        subtitle={editing?.id ? `New calibration event for ${editing.instrumentName ?? "instrument"}` : "New measuring instrument"}
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
              <input name="certificateNumber" defaultValue="" className={inputCls} />
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
              <input name="calibrationDate" type="date" defaultValue={TODAY} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Interval (days)</label>
              <input name="calibrationInterval" type="number" defaultValue={editing?.calibrationInterval ?? 365} className={inputCls} />
            </div>
          </div>

          <div className="pt-1 space-y-3">
            <p className={sectionCls}>Result</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelCls}>As Found</label>
                <Select value={asFound} onChange={setAsFound} ariaLabel="As-found condition">
                  <option value="NOT_CHECKED">Not checked</option>
                  <option value="IN_TOLERANCE">In tolerance</option>
                  <option value="OUT_OF_TOLERANCE">Out of tolerance</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>As Left</label>
                <Select value={asLeft} onChange={setAsLeft} ariaLabel="As-left condition">
                  <option value="IN_TOLERANCE">In tolerance</option>
                  <option value="ADJUSTED">Adjusted</option>
                  <option value="REJECTED">Rejected</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Verdict</label>
                <Select value={verdict} onChange={setVerdict} ariaLabel="Calibration verdict">
                  <option value="PASS">Pass</option>
                  <option value="FAIL">Fail</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Calibrated By</label>
                <input name="calibratedBy" defaultValue={editing?.calibratedBy ?? ""} className={inputCls} placeholder="Lab / technician" />
              </div>
            </div>
            {(verdict === "FAIL" || asFound === "OUT_OF_TOLERANCE" || asLeft === "REJECTED") && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-rose-500/30 bg-rose-500/5 text-rose-700 text-[11px]">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                <span>
                  Saving this will mark the instrument out of service and raise a non-conformity covering every
                  measurement taken since its last passing calibration.
                </span>
              </div>
            )}
          </div>

          <div className="pt-1 space-y-3">
            <p className={sectionCls}>Traceability · ISO 9001 7.1.5.2</p>
            <p className="text-[11px] text-slate-500">
              Record the standard this calibration was traced to, or the laboratory that performed it. One of the two
              is required.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelCls}>Traceable To</label>
                <input
                  name="traceableTo"
                  defaultValue={editing?.traceableTo ?? ""}
                  className={inputCls}
                  placeholder="NIST via ref std SN-4471"
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Reference Standard ID</label>
                <input name="referenceStandardId" defaultValue={editing?.referenceStandardId ?? ""} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Lab Name</label>
                <input name="labName" defaultValue={editing?.labName ?? ""} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Lab Accreditation No.</label>
                <input name="labAccreditationNo" defaultValue={editing?.labAccreditationNo ?? ""} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>Accreditation Body</label>
                <input
                  name="accreditationBody"
                  defaultValue={editing?.accreditationBody ?? ""}
                  className={inputCls}
                  placeholder="UKAS / NACL / DAkkS"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Notes</label>
            <textarea name="notes" rows={2} className={inputCls} placeholder="Deviations found, adjustments made…" />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save Calibration
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={history !== null}
        onClose={() => setHistory(null)}
        title="Calibration History"
        subtitle={history ? `${history.instrumentName}${history.serialNumber ? ` · S/N ${history.serialNumber}` : ""}` : ""}
      >
        {eventsLoading ? (
          <div className="py-10 flex justify-center items-center text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
            <span className="text-xs ml-2 font-mono">Loading history…</span>
          </div>
        ) : events.length === 0 ? (
          <div className="py-10 text-center text-slate-500">
            <History className="w-5 h-5 mx-auto mb-2 text-slate-400" />
            <p className="text-xs">No calibration events recorded for this instrument yet.</p>
            {history?.lastCalibrationDate && (
              <p className="text-[11px] text-slate-400 mt-1">
                The register shows a last calibration of {formatDate(history.lastCalibrationDate)}, recorded before
                event history was kept. The next calibration you record will start the history.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            {events.map((ev) => {
              const failed = ev.verdict === "FAIL" || ev.asFound === "OUT_OF_TOLERANCE";
              return (
                <div
                  key={ev.id}
                  className={`rounded-xl border p-4 space-y-2 ${failed ? "border-rose-500/30 bg-rose-500/5" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {formatDate(ev.calibrationDate)}
                    </span>
                    <Badge
                      className={
                        ev.verdict === "FAIL"
                          ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                      }
                    >
                      {ev.verdict}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ev.asFound && (
                      <Badge
                        className={
                          ev.asFound === "OUT_OF_TOLERANCE"
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            : "bg-slate-500/10 text-slate-600 border-slate-500/20"
                        }
                      >
                        {AS_FOUND_LABEL[ev.asFound] ?? ev.asFound}
                      </Badge>
                    )}
                    {ev.asLeft && (
                      <Badge
                        className={
                          ev.asLeft === "REJECTED"
                            ? "bg-rose-500/10 text-rose-600 border-rose-500/20"
                            : ev.asLeft === "ADJUSTED"
                              ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              : "bg-slate-500/10 text-slate-600 border-slate-500/20"
                        }
                      >
                        {AS_LEFT_LABEL[ev.asLeft] ?? ev.asLeft}
                      </Badge>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                    <Meta label="Certificate" value={ev.certificateNumber} mono />
                    <Meta label="Next due" value={ev.nextCalibrationDate ? formatDate(ev.nextCalibrationDate) : null} mono />
                    <Meta label="Traceable to" value={ev.traceableTo} />
                    <Meta
                      label="Laboratory"
                      value={ev.labName ? `${ev.labName}${ev.labAccreditationNo ? ` (${ev.labAccreditationNo})` : ""}` : null}
                    />
                    <Meta label="Calibrated by" value={ev.calibratedBy} />
                    <Meta label="Recorded" value={ev.createdAt ? formatDate(ev.createdAt) : null} mono />
                  </dl>
                  {ev.notes && <p className="text-[11px] text-slate-600 border-t border-slate-200 pt-2">{ev.notes}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Meta({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</dt>
      <dd className={`text-slate-700 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
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
