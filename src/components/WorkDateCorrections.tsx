// src/components/WorkDateCorrections.tsx
// On a finished PM batch: when the work was done, when it was recorded, and
// the way to put the work date right (LIMSL, 20 Nov 2026).
//
// The date is never edited. A correction is requested with its evidence, the
// Maintenance Manager signs it here, and that signature moves the date. Both
// dates stay on the record.
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import DateField from "@/components/DateField";
import SignoffChain from "@/components/SignoffChain";
import { Badge } from "@/components/Badge";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { formatDate } from "@/lib/utils";
import { WORK_DATE_ENTITY, dayOf } from "@/lib/maintenance/work-date";

type Row = { id: string; plannedDate: string; completedDate: string | null; recordedDate: string | null; equipmentName: string | null };
type Correction = {
  id: string;
  correctionNumber: string;
  workDate: string;
  evidence: string;
  reason: string;
  status: string;
  requestedByName: string | null;
  approvedByName: string | null;
  appliedAt: string | null;
  createdAt: string;
};

const spread = (dates: string[]) => {
  const d = [...new Set(dates.filter(Boolean))].sort();
  return d.length === 0 ? "-" : d.length === 1 ? formatDate(d[0]) : `${formatDate(d[0])} to ${formatDate(d[d.length - 1])}`;
};

export default function WorkDateCorrections({
  batchId,
  canRequest,
  onChange,
}: {
  batchId: string;
  /** Foreman or a manager other than the Maintenance Manager, who approves. */
  canRequest: boolean;
  onChange?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<Row[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ workDate: "", evidence: "", reason: "" });

  const load = () => {
    fetch(`/api/work-date-corrections?batchId=${encodeURIComponent(batchId)}`)
      .then((r) => (r.ok ? r.json() : { rows: [], corrections: [] }))
      .then((d) => {
        setRows(d.rows ?? []);
        setCorrections(d.corrections ?? []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  };
  useEffect(load, [batchId]);

  if (!loaded || rows.length === 0) return null;

  const pending = corrections.find((c) => c.status === "PENDING_APPROVAL");
  const recorded = rows.map((r) => dayOf(r.recordedDate)).filter(Boolean);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/work-date-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, ...form }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not raise the correction.");
        return;
      }
      toast.success(`${d.correctionNumber} sent to the Maintenance Manager. The date changes when it is approved.`);
      setOpen(false);
      setForm({ workDate: "", evidence: "", reason: "" });
      load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id="work-date" className="bg-surface border border-line rounded-xl shadow-card p-5 space-y-4" aria-labelledby="work-date-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="work-date-title" className="text-base font-semibold text-ink-900 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-brand-600" /> Work date
          </h2>
          <dl className="flex flex-wrap gap-x-8 gap-y-1 mt-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-ink-500">Work done on</dt>
              <dd className="font-medium text-ink-900 tabular-nums">{spread(rows.map((r) => dayOf(r.completedDate)))}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-500">Planned for</dt>
              <dd className="font-medium text-ink-900 tabular-nums">{spread(rows.map((r) => r.plannedDate))}</dd>
            </div>
            {recorded.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-ink-500">Recorded in the system on</dt>
                <dd className="font-medium text-ink-900 tabular-nums">{spread(recorded)}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-ink-500 mt-2 max-w-2xl">
            Compliance is measured on the work date. If the work was done on a different day than this record shows,
            request a correction with the evidence. The Maintenance Manager approves it, and both dates stay on the record.
          </p>
        </div>
        {canRequest && !pending && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            Correct the work date
          </Button>
        )}
      </div>

      {corrections.map((c) => (
        <div key={c.id} className="rounded-lg border border-line p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-900">{c.correctionNumber}</span>
            <Badge
              className={
                c.status === "APPLIED"
                  ? "bg-brand-500/10 text-brand-700 border-brand-500/20"
                  : "bg-warn-500/10 text-warn-700 border-warn-500/20"
              }
            >
              {c.status === "APPLIED" ? "Approved and applied" : "Waiting for the Maintenance Manager"}
            </Badge>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-ink-500">Work date requested</dt>
              <dd className="text-ink-900 tabular-nums">{formatDate(c.workDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Requested by</dt>
              <dd className="text-ink-900">
                {c.requestedByName ?? "-"}, {formatDate(dayOf(c.createdAt))}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Evidence</dt>
              <dd className="text-ink-900 break-words">{c.evidence}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Reason</dt>
              <dd className="text-ink-900 break-words">{c.reason}</dd>
            </div>
          </dl>
          <SignoffChain
            entityType={WORK_DATE_ENTITY}
            entityId={c.id}
            title="Approval"
            onChange={() => {
              load();
              onChange?.();
            }}
          />
        </div>
      ))}

      <Modal open={open} onClose={() => setOpen(false)} title="Correct the work date" subtitle="Sent to the Maintenance Manager for approval">
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-ink-600">
            This covers the {rows.length} machine{rows.length === 1 ? "" : "s"} completed on this batch. Nothing changes
            until the Maintenance Manager approves it.
          </p>
          <div>
            <label className={LABEL_CLASS} htmlFor="wdc-date">
              Date the work was done
            </label>
            <DateField id="wdc-date" value={form.workDate} onChange={(v) => setForm((f) => ({ ...f, workDate: v }))} max={today} required />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="wdc-evidence">
              Evidence
            </label>
            <input
              id="wdc-evidence"
              value={form.evidence}
              onChange={(e) => setForm((f) => ({ ...f, evidence: e.target.value }))}
              placeholder="e.g. Equipment History Log, Sertom Plate Roller sheet, entry of 26 Jan 2026"
              className={FIELD_CLASS}
              required
            />
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="wdc-reason">
              Why the recorded date is not the work date
            </label>
            <textarea
              id="wdc-reason"
              rows={3}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Done on paper in January and entered into the system in November"
              className={`${FIELD_CLASS} resize-none`}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Send for approval
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
