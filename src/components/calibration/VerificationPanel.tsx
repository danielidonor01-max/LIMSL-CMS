// src/components/calibration/VerificationPanel.tsx
// In-house verification of welding machines and cranes against a calibrated
// reference instrument, the way a stand verification is done on the floor. The
// reference list only offers instruments that are in calibration; the route
// enforces the same rule, so the list is a convenience, not the control.
"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Scale, History, Factory, Plus, Trash2, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { invalidateApi, useApi } from "@/lib/api-cache";
import MetricPanel from "@/components/MetricPanel";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import DateField from "@/components/DateField";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import SegmentedControl from "@/components/SegmentedControl";
import KebabMenu, { type KebabItem } from "@/components/KebabMenu";
import { Badge } from "@/components/Badge";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { formatDate } from "@/lib/utils";
import { referenceError, type DueState, type Reading } from "@/lib/premob-verification";
import { DaysHint, DueBadge, FILE_ACCEPT, FILE_CLASS, SetupNotice, uploadProof } from "./shared";

type VerificationRecord = {
  id: string;
  equipmentId: string;
  verificationDate: string;
  referenceSnapshot: string | null;
  readings: string | null;
  result: "PASS" | "FAIL";
  nextDueDate: string | null;
  proofFileKey: string | null;
  notes: string | null;
  verifiedByName: string | null;
};

type Machine = {
  id: string;
  assetId: string;
  name: string;
  category: string | null;
  latest: VerificationRecord | null;
  state: DueState;
};

type Instrument = {
  id: string;
  instrumentName: string;
  serialNumber: string | null;
  nextCalibrationDate: string | null;
  status: string | null;
};

type Payload = { machines: Machine[]; records: VerificationRecord[]; setupRequired: boolean };

const TODAY = new Date().toISOString().slice(0, 10);
const equipmentHref = (assetId: string) => `/equipment/${assetId.replace(/\//g, "-")}`;
const TYPE_LABEL: Record<string, string> = { WELDING: "Welding machine", CRANE: "Crane" };

// What is usually checked, as a starting row. Editable: these are prompts for
// the person at the machine, not a fixed procedure.
const STARTER: Record<string, string> = {
  WELDING: "Welding current (A)",
  CRANE: "Load indicator at test load (t)",
};

const emptyReading = (parameter = ""): Reading => ({ parameter, machine: "", reference: "", tolerance: "" });

const parseReadings = (raw: string | null): Reading[] => {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

export default function VerificationPanel({ canWrite, openNew }: { canWrite: boolean; openNew: number }) {
  const { data, loading, refresh } = useApi<Payload>("/api/verifications", { machines: [], records: [], setupRequired: false });
  const { data: instrumentData } = useApi<Instrument[]>("/api/calibration", []);
  const machines = useMemo(() => data.machines ?? [], [data.machines]);
  const records = useMemo(() => data.records ?? [], [data.records]);
  const instruments = useMemo(() => (Array.isArray(instrumentData) ? instrumentData : []), [instrumentData]);

  const [form, setForm] = useState<{ equipmentId: string } | null>(null);
  const [history, setHistory] = useState<Machine | null>(null);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(TODAY);
  const [nextDue, setNextDue] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [result, setResult] = useState<"PASS" | "FAIL">("PASS");
  const [readings, setReadings] = useState<Reading[]>([emptyReading()]);
  const fileRef = useRef<HTMLInputElement>(null);

  const machineById = (id: string) => machines.find((m) => m.id === id);

  const open = (equipmentId = "") => {
    setDate(TODAY);
    setNextDue("");
    setReferenceId("");
    setResult("PASS");
    setReadings([emptyReading(STARTER[machineById(equipmentId)?.category ?? ""] ?? "")]);
    setForm({ equipmentId });
  };

  // The page header's button bumps openNew. Responding during render rather
  // than in an effect is React's pattern for state that follows a prop, and
  // avoids a second render with the form still shut.
  const [seenOpenNew, setSeenOpenNew] = useState(openNew);
  if (openNew !== seenOpenNew) {
    setSeenOpenNew(openNew);
    if (openNew > 0) open();
  }

  const usable = useMemo(
    () => instruments.filter((i) => referenceError(i, date) === null),
    [instruments, date],
  );

  const summary = useMemo(() => {
    const c: Record<DueState, number> = { CURRENT: 0, DUE_SOON: 0, OVERDUE: 0, NONE: 0 };
    machines.forEach((m) => c[m.state]++);
    const failed = machines.filter((m) => m.latest?.result === "FAIL").length;
    return { ...c, failed };
  }, [machines]);

  const setReading = (i: number, patch: Partial<Reading>) =>
    setReadings((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form?.equipmentId) return toast.error("Choose the machine.");
    if (!referenceId) return toast.error("Choose the calibrated instrument the machine was checked against.");
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const file = fileRef.current?.files?.[0];
      const proof = file ? await uploadProof(file) : null;
      const res = await fetch("/api/verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: form.equipmentId,
          verificationDate: date,
          referenceInstrumentId: referenceId,
          readings,
          result,
          nextDueDate: nextDue || null,
          notes: fd.get("notes"),
          proofFileKey: proof?.key,
          proofFileName: proof?.name,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to record the verification.");
      if (result === "FAIL") {
        toast.warning("Verification recorded as failed. Raise a breakdown report if the machine is unsafe to use.");
      } else {
        toast.success("Verification recorded and added to the machine's history.");
      }
      setForm(null);
      invalidateApi("/api/verifications");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record the verification.");
    } finally {
      setSaving(false);
    }
  }

  const rowActions = (m: Machine): KebabItem[] => [
    ...(canWrite && !data.setupRequired ? [{ label: "Record verification", icon: Scale, onClick: () => open(m.id) }] : []),
    { label: "History", icon: History, onClick: () => setHistory(m) },
    { label: "Equipment page", icon: Factory, href: equipmentHref(m.assetId) },
  ];

  const machineHistory = history ? records.filter((r) => r.equipmentId === history.id) : [];

  if (loading) {
    return (
      <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
        <TableSkeleton rows={6} cols={6} />
      </div>
    );
  }

  return (
    <>
      <SetupNotice show={data.setupRequired} />

      <MetricPanel
        columns={3}
        label="Verification status"
        metrics={[
          { key: "current", label: "Verified and current", count: summary.CURRENT, value: String(summary.CURRENT), status: "plain", icon: CheckCircle2, description: "Readings agree with a calibrated reference" },
          { key: "due", label: "Due within 30 days", count: summary.DUE_SOON, value: String(summary.DUE_SOON), status: "warning", icon: Clock, description: "Plan the stand check" },
          {
            key: "attention",
            label: "Failed, lapsed or never verified",
            count: summary.failed + summary.OVERDUE + summary.NONE,
            value: String(summary.failed + summary.OVERDUE + summary.NONE),
            status: "danger",
            icon: AlertTriangle,
            description: "Readings on these are unconfirmed",
          },
        ]}
      />

      <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
        {machines.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="No welding machines or cranes registered"
            message="In-house verification is tracked for the Welding and Crane categories."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-ink-200 text-ink-500">
                  <th className="py-3 px-5 font-medium">Machine</th>
                  <th className="py-3 px-5 font-medium">Type</th>
                  <th className="py-3 px-5 font-medium">Last verified</th>
                  <th className="py-3 px-5 font-medium">Reference instrument</th>
                  <th className="py-3 px-5 font-medium">Result</th>
                  <th className="py-3 px-5 font-medium">Next due</th>
                  <th className="py-3 px-5 font-medium">Status</th>
                  <th className="py-3 px-5 font-medium w-14"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-200">
                {machines.map((m) => (
                  <tr key={m.id} className="hover:bg-ink-50">
                    <td className="py-3 px-5">
                      <Link href={equipmentHref(m.assetId)} className="font-medium text-ink-900 hover:text-brand-700 hover:underline underline-offset-2">
                        {m.name}
                      </Link>
                      <div className="text-xs text-ink-500 tabular-nums">{m.assetId}</div>
                    </td>
                    <td className="py-3 px-5 text-ink-500">{TYPE_LABEL[m.category ?? ""] ?? m.category}</td>
                    <td className="py-3 px-5 tabular-nums text-ink-700">{m.latest ? formatDate(m.latest.verificationDate) : "-"}</td>
                    <td className="py-3 px-5 text-ink-500 max-w-[16rem] truncate" title={m.latest?.referenceSnapshot ?? undefined}>
                      {m.latest?.referenceSnapshot ?? "-"}
                    </td>
                    <td className="py-3 px-5">
                      {m.latest ? (
                        <Badge
                          className={
                            m.latest.result === "PASS"
                              ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                              : "bg-danger-500/10 text-danger-700 border-danger-500/20"
                          }
                        >
                          {m.latest.result === "PASS" ? "Pass" : "Fail"}
                        </Badge>
                      ) : (
                        <span className="text-ink-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-5 tabular-nums text-ink-700 whitespace-nowrap">
                      {m.latest?.nextDueDate ? (
                        <>
                          {formatDate(m.latest.nextDueDate)}
                          <DaysHint iso={m.latest.nextDueDate} />
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-5">
                      <DueBadge state={m.state} noneLabel={m.latest ? "No due date" : "Not verified"} />
                    </td>
                    <td className="py-3 px-5 text-right">
                      <KebabMenu ariaLabel={`Actions for ${m.assetId}`} items={rowActions(m)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title="Record Verification"
        subtitle="In-house check against a calibrated reference"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Machine</label>
              <Select
                value={form?.equipmentId ?? ""}
                onChange={(v) => {
                  setForm((f) => (f ? { ...f, equipmentId: v } : f));
                  const starter = STARTER[machineById(v)?.category ?? ""];
                  setReadings((rs) => (rs.length === 1 && !rs[0].machine && !rs[0].reference ? [emptyReading(starter ?? "")] : rs));
                }}
                className="w-full"
                ariaLabel="Machine"
              >
                <option value="" disabled>Select machine…</option>
                {machines.map((m) => (
                  <option key={m.id} value={m.id}>{m.assetId}, {m.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Verification date</label>
              <DateField value={date} onChange={setDate} max={TODAY} required ariaLabel="Verification date" />
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS}>Reference instrument</label>
            <Select value={referenceId} onChange={setReferenceId} className="w-full" ariaLabel="Reference instrument">
              <option value="" disabled>{usable.length ? "Select a calibrated instrument…" : "No instrument is in calibration on this date"}</option>
              {usable.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.instrumentName}{i.serialNumber ? ` · S/N ${i.serialNumber}` : ""} · cal due {formatDate(i.nextCalibrationDate)}
                </option>
              ))}
            </Select>
            <p className="text-xs text-ink-400 mt-1">
              Only instruments in calibration on the verification date are listed. Register or recalibrate one on the
              Calibration tab.
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className={LABEL_CLASS}>Readings</legend>
            <div className="hidden sm:grid grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-2 text-xs text-ink-500">
              <span>Parameter</span>
              <span>Machine reads</span>
              <span>Reference reads</span>
              <span>Tolerance</span>
              <span className="w-11" />
            </div>
            {readings.map((r, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-[1.6fr_1fr_1fr_1fr_auto] gap-2 items-center">
                <input
                  aria-label={`Parameter ${i + 1}`}
                  value={r.parameter}
                  onChange={(e) => setReading(i, { parameter: e.target.value })}
                  className={`${FIELD_CLASS} col-span-2 sm:col-span-1`}
                  placeholder="e.g. Output voltage (V)"
                />
                <input aria-label={`Machine reading ${i + 1}`} value={r.machine} onChange={(e) => setReading(i, { machine: e.target.value })} className={FIELD_CLASS} placeholder="Machine" />
                <input aria-label={`Reference reading ${i + 1}`} value={r.reference} onChange={(e) => setReading(i, { reference: e.target.value })} className={FIELD_CLASS} placeholder="Reference" />
                <input aria-label={`Tolerance ${i + 1}`} value={r.tolerance} onChange={(e) => setReading(i, { tolerance: e.target.value })} className={FIELD_CLASS} placeholder="±5%" />
                <button
                  type="button"
                  onClick={() => setReadings((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyReading()]))}
                  aria-label={`Remove reading ${i + 1}`}
                  className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-ink-400 hover:text-danger-700 hover:bg-danger-50"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {readings.length < 20 && (
              <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={() => setReadings((rs) => [...rs, emptyReading()])}>
                Add reading
              </Button>
            )}
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Result</label>
              <SegmentedControl
                ariaLabel="Verification result"
                value={result}
                onChange={setResult}
                options={[
                  { value: "PASS", label: "Pass" },
                  { value: "FAIL", label: "Fail" },
                ]}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Next due (optional)</label>
              <DateField value={nextDue} onChange={setNextDue} min={date} ariaLabel="Next verification due" />
            </div>
          </div>

          {result === "FAIL" && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-danger-200 bg-danger-50 text-danger-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
              <span>
                A failed verification is recorded on the machine&apos;s history but does not change its status. If it is
                unsafe to use, report a fault from the equipment page.
              </span>
            </div>
          )}

          <div>
            <label className={LABEL_CLASS}>Supporting record (optional)</label>
            <input ref={fileRef} type="file" accept={FILE_ACCEPT} className={FILE_CLASS} />
          </div>
          <div>
            <label className={LABEL_CLASS}>Notes (optional)</label>
            <textarea name="notes" rows={2} className={FIELD_CLASS} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save verification</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={history !== null}
        onClose={() => setHistory(null)}
        title="Verification History"
        subtitle={history ? `${history.name} · ${history.assetId}` : ""}
        maxWidthClass="max-w-xl"
      >
        {machineHistory.length === 0 ? (
          <EmptyState icon={Scale} title="Not verified yet" message="The first verification you record for this machine starts its history." />
        ) : (
          <ul className="divide-y divide-line max-h-[60vh] overflow-y-auto">
            {machineHistory.map((r) => (
              <li key={r.id} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink-900 tabular-nums">{formatDate(r.verificationDate)}</p>
                  <Badge
                    className={
                      r.result === "PASS"
                        ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                        : "bg-danger-500/10 text-danger-700 border-danger-500/20"
                    }
                  >
                    {r.result === "PASS" ? "Pass" : "Fail"}
                  </Badge>
                </div>
                <p className="text-xs text-ink-500">
                  Against {r.referenceSnapshot ?? "a reference instrument"}
                  {r.verifiedByName ? ` · by ${r.verifiedByName}` : ""}
                  {r.nextDueDate ? ` · next due ${formatDate(r.nextDueDate)}` : ""}
                </p>
                {parseReadings(r.readings).length > 0 && (
                  <ul className="text-xs text-ink-700 space-y-0.5">
                    {parseReadings(r.readings).map((x, i) => (
                      <li key={i} className="tabular-nums">
                        {x.parameter}: {x.machine || "-"} vs {x.reference || "-"}
                        {x.tolerance ? <span className="text-ink-500"> ({x.tolerance})</span> : null}
                      </li>
                    ))}
                  </ul>
                )}
                {r.notes && <p className="text-xs text-ink-600">{r.notes}</p>}
                {r.proofFileKey && (
                  <a href={`/api/files/${r.proofFileKey}`} target="_blank" rel="noreferrer" className="text-xs font-medium text-brand-700 hover:underline">
                    Supporting record
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
