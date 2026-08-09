// src/app/emergency/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  ShieldAlert,
  Plus,
  Search,
  AlertTriangle,
  Download,
  ClipboardCheck,
  Siren,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { useApi } from "@/lib/api-cache";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import LoadError from "@/components/LoadError";
import { Badge } from "@/components/Badge";
import Field, { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { downloadCSV } from "@/lib/export";
import { formatDate } from "@/lib/utils";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";
import {
  EMERGENCY_TYPE_LABELS,
  DRILL_TYPE_LABELS,
  intervalFor,
  type EmergencyEquipmentType,
  type DrillType,
} from "@/lib/hse/emergency";

type Item = {
  id: string;
  tagNumber: string;
  type: string;
  location: string;
  capacity: string | null;
  lastInspectionDate: string | null;
  inspectionIntervalDays: number | null;
  expiryDate: string | null;
  status: string;
  readiness: {
    ready: boolean;
    severity: "ok" | "warn" | "fail";
    reasons: string[];
    inspection: string;
    expiry: string;
    daysUntilInspection: number | null;
  };
};

type Payload = {
  items: Item[];
  summary: { total: number; inService: number; ready: number; notReady: number; dueSoon: number; percent: number | null };
  drills: any[];
  drillProgramme: { lastDrillDate: string | null; daysSince: number | null; status: string; nextDueDate: string | null };
  drillFollowUp: { withDeficiencies: number; unresolved: number };
};

const emptyItem = {
  tagNumber: "",
  type: "FIRE_ALARM" as EmergencyEquipmentType,
  location: "",
  capacity: "",
  installedDate: "",
  lastInspectionDate: "",
  inspectionIntervalDays: String(intervalFor("FIRE_ALARM")),
  expiryDate: "",
  notes: "",
};

const emptyDrill = {
  drillType: "FIRE_EVACUATION" as DrillType,
  drillDate: new Date().toISOString().slice(0, 10),
  location: "",
  scenario: "",
  participantCount: "",
  evacuationMinutes: "",
  observations: "",
  deficiencies: "",
  correctiveActions: "",
};

const DRILL_BADGE: Record<string, string> = {
  OK: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  DUE_SOON: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  OVERDUE: "bg-rose-500/10 text-rose-700 border-rose-500/20",
  NEVER: "bg-rose-500/10 text-rose-700 border-rose-500/20",
};

const DRILL_LABEL: Record<string, string> = {
  OK: "Within interval",
  DUE_SOON: "Due soon",
  OVERDUE: "Overdue",
  NEVER: "No drill ever recorded",
};

export default function EmergencyPage() {
  const { data, loading, error, refresh } = useApi<Payload | null>("/api/emergency", null);
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && COMPLIANCE_WRITE_ROLES.includes(role ?? "");

  const [tab, setTab] = useState<"register" | "drills">("register");
  const [q, setQ] = useState("");
  const [notReadyOnly, setNotReadyOnly] = useState(false);
  const [showItem, setShowItem] = useState(false);
  const [showDrill, setShowDrill] = useState(false);
  const [itemForm, setItemForm] = useState(emptyItem);
  const [drillForm, setDrillForm] = useState(emptyDrill);
  const [saving, setSaving] = useState(false);
  const [inspect, setInspect] = useState<{ item: Item; verdict: "PASS" | "FAIL"; findings: string; actionTaken: string } | null>(null);

  const items = data?.items ?? [];
  const summary = data?.summary;

  const filtered = useMemo(() => {
    let out = items;
    if (notReadyOnly) out = out.filter((i) => !i.readiness.ready && i.status !== "REMOVED");
    if (q.trim()) {
      const term = q.toLowerCase();
      out = out.filter(
        (i) =>
          i.tagNumber.toLowerCase().includes(term) ||
          i.location.toLowerCase().includes(term) ||
          (EMERGENCY_TYPE_LABELS[i.type as EmergencyEquipmentType] ?? i.type).toLowerCase().includes(term),
      );
    }
    return out;
  }, [items, q, notReadyOnly]);

  const submitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemForm.tagNumber.trim() || !itemForm.location.trim()) {
      toast.error("A tag number and a location are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to add the item.");
        return;
      }
      toast.success(`${itemForm.tagNumber} added to the emergency register.`);
      setShowItem(false);
      setItemForm(emptyItem);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const submitDrill = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...drillForm, kind: "DRILL" }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to record the drill.");
        return;
      }
      toast.success("Drill recorded.");
      setShowDrill(false);
      setDrillForm(emptyDrill);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const submitInspection = async () => {
    if (!inspect) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/emergency/${inspect.item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "inspect",
          verdict: inspect.verdict,
          findings: inspect.findings,
          actionTaken: inspect.actionTaken,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Failed to record the inspection.");
        return;
      }
      toast.success(
        inspect.verdict === "FAIL"
          ? `${inspect.item.tagNumber} marked defective and taken out of service.`
          : `${inspect.item.tagNumber} inspected and passed.`,
      );
      setInspect(null);
      refresh();
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () =>
    downloadCSV(
      `emergency-equipment-${new Date().toISOString().slice(0, 10)}`,
      filtered.map((i) => ({
        Tag: i.tagNumber,
        Type: EMERGENCY_TYPE_LABELS[i.type as EmergencyEquipmentType] ?? i.type,
        Location: i.location,
        Capacity: i.capacity ?? "",
        Status: i.status,
        "Last inspected": i.lastInspectionDate ?? "Never",
        "Interval (days)": i.inspectionIntervalDays ?? intervalFor(i.type),
        Expires: i.expiryDate ?? "",
        Ready: i.readiness.ready ? "Yes" : "No",
        "Why not": i.readiness.reasons.join(" "),
      })),
    );

  const prog = data?.drillProgramme;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-5">
        <PageHeader
          icon={ShieldAlert}
          title="Emergency Preparedness"
          subtitle="Fire, first-aid and rescue equipment, and the drill programme — ISO 45001 clause 8.2"
          code="LIMSL-HSE-EMG-017"
          backHref="/"
          backLabel="Dashboard"
          actions={
            <>
              <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!filtered.length}>
                Export
              </Button>
              {canWrite && (
                <Button icon={Plus} onClick={() => (tab === "drills" ? setShowDrill(true) : setShowItem(true))}>
                  {tab === "drills" ? "Record Drill" : "Add Equipment"}
                </Button>
              )}
            </>
          }
        />

        {/* Readiness, not headcount. "We have forty extinguishers" is not the
            number; "thirty-one of forty ready" is. */}
        {!loading && summary && summary.inService > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className={`p-4 rounded-xl border ${
                (summary.percent ?? 0) === 100
                  ? "bg-emerald-50 border-emerald-200"
                  : (summary.percent ?? 0) >= 90
                    ? "bg-amber-50 border-amber-200"
                    : "bg-rose-50 border-rose-200"
              }`}
            >
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Ready for use</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">
                {summary.ready}
                <span className="text-lg text-slate-500 font-semibold"> / {summary.inService}</span>
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                {summary.notReady > 0
                  ? `${summary.notReady} cannot be relied on right now`
                  : "Every item is serviceable, in date and inspected"}
              </p>
            </div>
            <div className={`p-4 rounded-xl border ${summary.dueSoon > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Inspection due soon</p>
              <p className="text-3xl font-bold text-slate-900 mt-2">{summary.dueSoon}</p>
              <p className="text-[11px] text-slate-600 mt-1">Still usable, but approaching their interval</p>
            </div>
            <div className={`p-4 rounded-xl border ${prog && prog.status !== "OK" ? "bg-rose-50 border-rose-200" : "bg-white border-slate-200"}`}>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Evacuation drill</p>
              <p className="text-lg font-bold text-slate-900 mt-2">
                {prog?.lastDrillDate ? formatDate(prog.lastDrillDate) : "Never held"}
              </p>
              <p className="text-[11px] text-slate-600 mt-1">
                {prog?.status === "OK" && prog.nextDueDate
                  ? `Next due ${formatDate(prog.nextDueDate)}`
                  : DRILL_LABEL[prog?.status ?? "NEVER"]}
              </p>
            </div>
          </div>
        )}

        {data && data.drillFollowUp.unresolved > 0 && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              <strong>{data.drillFollowUp.unresolved}</strong> drill
              {data.drillFollowUp.unresolved === 1 ? " has" : "s have"} recorded deficiencies with no corrective action
              against them. A drill that found problems and closed none taught the organisation nothing — and it is the
              first thing an auditor probes.
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="flex gap-1 bg-slate-100 border border-slate-200 rounded-lg p-1 w-fit">
            {(["register", "drills"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 min-h-9 rounded-md text-xs font-semibold transition-all ${
                  tab === t ? "bg-white text-emerald-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {t === "register" ? `Equipment (${items.length})` : `Drill log (${data?.drills.length ?? 0})`}
              </button>
            ))}
          </div>

          {tab === "register" && (
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Tag, type or location…"
                  className="w-full sm:w-56 bg-white border border-slate-200 rounded-lg min-h-11 pl-10 pr-4 text-sm focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>
              <button
                onClick={() => setNotReadyOnly((v) => !v)}
                aria-pressed={notReadyOnly}
                className={`inline-flex items-center gap-2 px-3 min-h-11 rounded-lg border text-xs font-semibold w-fit transition-colors ${
                  notReadyOnly ? "bg-rose-50 border-rose-300 text-rose-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <AlertTriangle className="w-4 h-4" /> Not ready only
              </button>
            </div>
          )}
        </div>

        {/* ── Equipment register ── */}
        {tab === "register" && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {error && !loading ? (
              <LoadError what="the emergency register" onRetry={refresh} />
            ) : loading ? (
              <TableSkeleton rows={6} cols={5} />
            ) : !filtered.length ? (
              q.trim() || notReadyOnly ? (
                <EmptyState
                  icon={Search}
                  title={notReadyOnly ? "Everything is ready for use" : "Nothing matches that search"}
                  message={
                    notReadyOnly
                      ? "Every item in service is serviceable, in date and inspected within its interval."
                      : "No tag, type or location matches what you typed."
                  }
                  actionLabel="Clear"
                  onAction={() => {
                    setQ("");
                    setNotReadyOnly(false);
                  }}
                />
              ) : (
                <EmptyState
                  icon={ShieldAlert}
                  title="No emergency or safety equipment registered"
                  message="Start with the fire alarm system, smoke detectors, lightning arrestors, earthing and spill kits. Recording where each one is and how often it must be checked is what turns installed equipment into evidence that it works."
                  actionLabel={canWrite ? "Add the first item" : undefined}
                  onAction={canWrite ? () => setShowItem(true) : undefined}
                />
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-500">
                      <th className="py-3 px-4 font-semibold">Tag</th>
                      <th className="py-3 px-4 font-semibold">Type</th>
                      <th className="py-3 px-4 font-semibold">Location</th>
                      <th className="py-3 px-4 font-semibold">Last checked</th>
                      <th className="py-3 px-4 font-semibold">Ready?</th>
                      {canWrite && <th className="py-3 px-4 font-semibold text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filtered.map((i) => (
                      <tr key={i.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">{i.tagNumber}</td>
                        <td className="py-3 px-4 text-slate-700">
                          {EMERGENCY_TYPE_LABELS[i.type as EmergencyEquipmentType] ?? i.type}
                          {i.capacity ? <span className="text-slate-400"> · {i.capacity}</span> : null}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {i.location}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {i.lastInspectionDate ? formatDate(i.lastInspectionDate) : <span className="text-rose-600">Never</span>}
                        </td>
                        <td className="py-3 px-4 max-w-[280px]">
                          {i.status === "REMOVED" ? (
                            <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20">Withdrawn</Badge>
                          ) : i.readiness.ready ? (
                            <Badge
                              className={
                                i.readiness.severity === "warn"
                                  ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                                  : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                              }
                            >
                              {i.readiness.severity === "warn" ? "Ready — check due" : "Ready"}
                            </Badge>
                          ) : (
                            <>
                              <Badge className="bg-rose-500/10 text-rose-700 border-rose-500/20">Not ready</Badge>
                              <p className="text-[10px] text-rose-700 mt-1 leading-snug">
                                {i.readiness.reasons.join(" ")}
                              </p>
                            </>
                          )}
                        </td>
                        {canWrite && (
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => setInspect({ item: i, verdict: "PASS", findings: "", actionTaken: "" })}
                              className="inline-flex items-center gap-1.5 px-2.5 min-h-9 rounded-lg text-emerald-700 hover:bg-emerald-50 text-xs font-semibold"
                            >
                              <ClipboardCheck className="w-4 h-4" /> Inspect
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Drill log ── */}
        {tab === "drills" && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <TableSkeleton rows={4} cols={4} />
            ) : !data?.drills.length ? (
              <EmptyState
                icon={Siren}
                title="No drills recorded"
                message="ISO 45001 asks for periodic emergency drills, and for evidence that what they surfaced was acted on. Record the next one here — including anything that went wrong, which is the part that matters."
                actionLabel={canWrite ? "Record a drill" : undefined}
                onAction={canWrite ? () => setShowDrill(true) : undefined}
              />
            ) : (
              <div className="divide-y divide-slate-200">
                {data.drills.map((d: any) => (
                  <div key={d.id} data-list-card className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {DRILL_TYPE_LABELS[d.drillType as DrillType] ?? d.drillType}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatDate(d.drillDate)}
                          {d.location ? ` · ${d.location}` : ""}
                          {d.participantCount ? ` · ${d.participantCount} took part` : ""}
                          {d.evacuationMinutes ? ` · cleared in ${d.evacuationMinutes} min` : ""}
                        </p>
                      </div>
                      <span className="text-[11px] text-slate-400">{d.conductedByName ?? "—"}</span>
                    </div>
                    {d.scenario && <p className="text-xs text-slate-600">{d.scenario}</p>}
                    {d.observations && <p className="text-xs text-slate-600">{d.observations}</p>}
                    {d.deficiencies && (
                      <div
                        className={`text-xs rounded-lg border p-2.5 ${
                          d.correctiveActions
                            ? "bg-slate-50 border-slate-200 text-slate-700"
                            : "bg-amber-50 border-amber-200 text-amber-900"
                        }`}
                      >
                        <p>
                          <strong>Found:</strong> {d.deficiencies}
                        </p>
                        <p className="mt-1">
                          <strong>Action:</strong>{" "}
                          {d.correctiveActions || <span className="font-semibold">none recorded</span>}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Add equipment */}
        <Modal open={showItem} onClose={() => setShowItem(false)} title="Add emergency & safety equipment" subtitle="Where it is and how often it must be checked">
          <form onSubmit={submitItem} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tag number *" htmlFor="em-tag">
                <input id="em-tag" value={itemForm.tagNumber} onChange={(e) => setItemForm((f) => ({ ...f, tagNumber: e.target.value }))} className={`${FIELD_CLASS} font-mono`} required />
              </Field>
              <div>
                <label className={LABEL_CLASS}>Type</label>
                <Select
                  value={itemForm.type}
                  onChange={(v) => setItemForm((f) => ({ ...f, type: v as EmergencyEquipmentType, inspectionIntervalDays: String(intervalFor(v)) }))}
                  className="w-full"
                >
                  {(Object.keys(EMERGENCY_TYPE_LABELS) as EmergencyEquipmentType[]).map((t) => (
                    <option key={t} value={t}>{EMERGENCY_TYPE_LABELS[t]}</option>
                  ))}
                </Select>
              </div>
            </div>

            <Field label="Location *" htmlFor="em-loc">
              <input id="em-loc" value={itemForm.location} onChange={(e) => setItemForm((f) => ({ ...f, location: e.target.value }))} placeholder="e.g. Bay 2, beside the roller shutter" className={FIELD_CLASS} required />
            </Field>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Capacity" htmlFor="em-cap">
                <input id="em-cap" value={itemForm.capacity} onChange={(e) => setItemForm((f) => ({ ...f, capacity: e.target.value }))} placeholder="9 kg" className={FIELD_CLASS} />
              </Field>
              <Field label="Check every (days)" htmlFor="em-int">
                <input id="em-int" inputMode="numeric" value={itemForm.inspectionIntervalDays} onChange={(e) => setItemForm((f) => ({ ...f, inspectionIntervalDays: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Last checked" htmlFor="em-last">
                <input id="em-last" type="date" max={new Date().toISOString().slice(0, 10)} value={itemForm.lastInspectionDate} onChange={(e) => setItemForm((f) => ({ ...f, lastInspectionDate: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Expires" htmlFor="em-exp">
                <input id="em-exp" type="date" value={itemForm.expiryDate} onChange={(e) => setItemForm((f) => ({ ...f, expiryDate: e.target.value }))} className={FIELD_CLASS} />
              </Field>
            </div>
            <p className="text-[11px] text-slate-500 -mt-1">
              Leaving &ldquo;last checked&rdquo; blank is fine and honest — the item will show as never inspected until
              someone checks it, which is the truth.
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowItem(false)}>Cancel</Button>
              <Button type="submit" loading={saving} icon={Plus}>Add item</Button>
            </div>
          </form>
        </Modal>

        {/* Record drill */}
        <Modal open={showDrill} onClose={() => setShowDrill(false)} title="Record an emergency drill" subtitle="What went wrong is the part that matters">
          <form onSubmit={submitDrill} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLASS}>Drill type</label>
                <Select value={drillForm.drillType} onChange={(v) => setDrillForm((f) => ({ ...f, drillType: v as DrillType }))} className="w-full">
                  {(Object.keys(DRILL_TYPE_LABELS) as DrillType[]).map((t) => (
                    <option key={t} value={t}>{DRILL_TYPE_LABELS[t]}</option>
                  ))}
                </Select>
              </div>
              <Field label="Date held" htmlFor="dr-date">
                <input id="dr-date" type="date" max={new Date().toISOString().slice(0, 10)} value={drillForm.drillDate} onChange={(e) => setDrillForm((f) => ({ ...f, drillDate: e.target.value }))} className={FIELD_CLASS} />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Location" htmlFor="dr-loc">
                <input id="dr-loc" value={drillForm.location} onChange={(e) => setDrillForm((f) => ({ ...f, location: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="People taking part" htmlFor="dr-count">
                <input id="dr-count" inputMode="numeric" value={drillForm.participantCount} onChange={(e) => setDrillForm((f) => ({ ...f, participantCount: e.target.value }))} className={FIELD_CLASS} />
              </Field>
              <Field label="Cleared in (minutes)" htmlFor="dr-min">
                <input id="dr-min" inputMode="decimal" value={drillForm.evacuationMinutes} onChange={(e) => setDrillForm((f) => ({ ...f, evacuationMinutes: e.target.value }))} className={FIELD_CLASS} />
              </Field>
            </div>

            <Field label="Scenario" htmlFor="dr-scen">
              <input id="dr-scen" value={drillForm.scenario} onChange={(e) => setDrillForm((f) => ({ ...f, scenario: e.target.value }))} placeholder="e.g. Simulated fire at the welding bay" className={FIELD_CLASS} />
            </Field>

            <Field label="What went wrong" htmlFor="dr-def">
              <textarea id="dr-def" rows={2} value={drillForm.deficiencies} onChange={(e) => setDrillForm((f) => ({ ...f, deficiencies: e.target.value }))} placeholder="Blocked exit, slow roll-call, alarm not heard in the yard…" className={`${FIELD_CLASS} resize-none`} />
            </Field>

            <Field label="What is being done about it" htmlFor="dr-act">
              <textarea id="dr-act" rows={2} value={drillForm.correctiveActions} onChange={(e) => setDrillForm((f) => ({ ...f, correctiveActions: e.target.value }))} className={`${FIELD_CLASS} resize-none`} />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" onClick={() => setShowDrill(false)}>Cancel</Button>
              <Button type="submit" loading={saving} icon={Siren}>Record drill</Button>
            </div>
          </form>
        </Modal>

        {/* Inspect */}
        <Modal
          open={!!inspect}
          onClose={() => setInspect(null)}
          title="Record an inspection"
          subtitle={inspect ? `${inspect.item.tagNumber} · ${inspect.item.location}` : ""}
        >
          {inspect && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {(["PASS", "FAIL"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setInspect((s) => (s ? { ...s, verdict: v } : s))}
                    aria-pressed={inspect.verdict === v}
                    className={`min-h-11 rounded-lg border text-sm font-semibold transition-colors ${
                      inspect.verdict === v
                        ? v === "PASS"
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "bg-rose-600 border-rose-600 text-white"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {v === "PASS" ? "Serviceable" : "Not fit for use"}
                  </button>
                ))}
              </div>

              <Field label={inspect.verdict === "FAIL" ? "What is wrong with it *" : "Findings"} htmlFor="in-find">
                <textarea
                  id="in-find"
                  rows={2}
                  value={inspect.findings}
                  onChange={(e) => setInspect((s) => (s ? { ...s, findings: e.target.value } : s))}
                  placeholder={inspect.verdict === "FAIL" ? "Discharged, seal broken, gauge in the red…" : "Optional"}
                  className={`${FIELD_CLASS} resize-none`}
                />
              </Field>

              {inspect.verdict === "FAIL" && (
                <p className="text-[11px] text-rose-700 -mt-2">
                  Recording a failure takes this item out of service immediately, so it stops counting towards readiness
                  until it has been repaired and re-checked.
                </p>
              )}

              <Field label="Action taken" htmlFor="in-act">
                <input id="in-act" value={inspect.actionTaken} onChange={(e) => setInspect((s) => (s ? { ...s, actionTaken: e.target.value } : s))} className={FIELD_CLASS} />
              </Field>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setInspect(null)}>Cancel</Button>
                <Button type="button" loading={saving} onClick={submitInspection}>Record inspection</Button>
              </div>
            </div>
          )}
        </Modal>
      </main>
    </div>
  );
}
