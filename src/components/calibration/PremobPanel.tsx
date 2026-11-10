// src/components/calibration/PremobPanel.tsx
// Crane pre-mobilisation: one row per crane with its latest premob. LIMSL
// tracks the date, the vendor, the certificate and the next due date; which
// project the crane went to is not recorded (November 2026).
"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Construction, FileCheck2, History, ExternalLink, Factory, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { invalidateApi, useApi } from "@/lib/api-cache";
import MetricPanel from "@/components/MetricPanel";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import DateField from "@/components/DateField";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import KebabMenu, { type KebabItem } from "@/components/KebabMenu";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { formatDate } from "@/lib/utils";
import type { DueState } from "@/lib/premob-verification";
import { DaysHint, DueBadge, FILE_ACCEPT, FILE_CLASS, SetupNotice, uploadProof } from "./shared";

type PremobRecord = {
  id: string;
  equipmentId: string;
  premobDate: string;
  vendor: string;
  nextDueDate: string;
  certificateNumber: string | null;
  proofFileKey: string;
  proofFileName: string | null;
  notes: string | null;
  recordedByName: string | null;
};

type Crane = {
  id: string;
  assetId: string;
  name: string;
  location: string | null;
  latest: PremobRecord | null;
  state: DueState;
};

type Payload = { machines: Crane[]; records: PremobRecord[]; setupRequired: boolean };

const TODAY = new Date().toISOString().slice(0, 10);
const equipmentHref = (assetId: string) => `/equipment/${assetId.replace(/\//g, "-")}`;

export default function PremobPanel({ canWrite, openNew }: { canWrite: boolean; openNew: number }) {
  const { data, loading, refresh } = useApi<Payload>("/api/premob", { machines: [], records: [], setupRequired: false });
  const machines = useMemo(() => data.machines ?? [], [data.machines]);
  const records = useMemo(() => data.records ?? [], [data.records]);

  const [form, setForm] = useState<{ equipmentId: string } | null>(null);
  const [history, setHistory] = useState<Crane | null>(null);
  const [saving, setSaving] = useState(false);
  const [premobDate, setPremobDate] = useState(TODAY);
  const [nextDue, setNextDue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const open = (equipmentId = "") => {
    setPremobDate(TODAY);
    setNextDue("");
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

  const summary = useMemo(() => {
    const c: Record<DueState, number> = { CURRENT: 0, DUE_SOON: 0, OVERDUE: 0, NONE: 0 };
    machines.forEach((m) => c[m.state]++);
    return c;
  }, [machines]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form?.equipmentId) return toast.error("Choose the crane.");
    if (!nextDue) return toast.error("Enter when the next premob falls due.");
    const file = fileRef.current?.files?.[0];
    if (!file) return toast.error("Attach the premob certificate or report.");
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const proof = await uploadProof(file);
      const res = await fetch("/api/premob", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: form.equipmentId,
          premobDate,
          vendor: fd.get("vendor"),
          certificateNumber: fd.get("certificateNumber"),
          nextDueDate: nextDue,
          notes: fd.get("notes"),
          proofFileKey: proof.key,
          proofFileName: proof.name,
          proofMimeType: proof.mimeType,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to record the premob.");
      toast.success("Premob recorded and added to the crane's history.");
      setForm(null);
      invalidateApi("/api/premob");
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record the premob.");
    } finally {
      setSaving(false);
    }
  }

  const rowActions = (m: Crane): KebabItem[] => [
    ...(canWrite && !data.setupRequired ? [{ label: "Record premob", icon: FileCheck2, onClick: () => open(m.id) }] : []),
    { label: "History", icon: History, onClick: () => setHistory(m) },
    ...(m.latest ? [{ label: "View certificate", icon: ExternalLink, href: `/api/files/${m.latest.proofFileKey}` }] : []),
    { label: "Equipment page", icon: Factory, href: equipmentHref(m.assetId) },
  ];

  const craneHistory = history ? records.filter((r) => r.equipmentId === history.id) : [];

  if (loading) {
    return (
      <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
        <TableSkeleton rows={5} cols={6} />
      </div>
    );
  }

  return (
    <>
      <SetupNotice show={data.setupRequired} />

      <MetricPanel
        columns={3}
        label="Premob status"
        metrics={[
          { key: "current", label: "Current", count: summary.CURRENT, value: String(summary.CURRENT), status: "plain", icon: CheckCircle2, description: "Cleared to mobilise" },
          { key: "due", label: "Due within 30 days", count: summary.DUE_SOON, value: String(summary.DUE_SOON), status: "warning", icon: Clock, description: "Book the vendor now" },
          {
            key: "lapsed",
            label: "Lapsed or never done",
            count: summary.OVERDUE + summary.NONE,
            value: String(summary.OVERDUE + summary.NONE),
            status: "danger",
            icon: AlertTriangle,
            description: "Premob before the next project",
          },
        ]}
      />

      <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
        {machines.length === 0 ? (
          <EmptyState
            icon={Construction}
            title="No cranes registered"
            message="Premob is tracked for equipment in the Crane category. Register a crane and it appears here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-ink-200 text-ink-500">
                  <th className="py-3 px-5 font-medium">Crane</th>
                  <th className="py-3 px-5 font-medium">Last premob</th>
                  <th className="py-3 px-5 font-medium">Vendor</th>
                  <th className="py-3 px-5 font-medium">Certificate</th>
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
                    <td className="py-3 px-5 tabular-nums text-ink-700">{m.latest ? formatDate(m.latest.premobDate) : "-"}</td>
                    <td className="py-3 px-5 text-ink-700">{m.latest?.vendor ?? "-"}</td>
                    <td className="py-3 px-5">
                      {m.latest ? (
                        <a
                          href={`/api/files/${m.latest.proofFileKey}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-brand-700 font-medium hover:underline"
                        >
                          {m.latest.certificateNumber || "View"}
                        </a>
                      ) : (
                        <span className="text-ink-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-5 tabular-nums text-ink-700 whitespace-nowrap">
                      {m.latest ? (
                        <>
                          {formatDate(m.latest.nextDueDate)}
                          <DaysHint iso={m.latest.nextDueDate} />
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-5">
                      <DueBadge state={m.state} noneLabel="No premob" />
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

      <Modal open={form !== null} onClose={() => setForm(null)} title="Record Premob" subtitle="Third-party pre-mobilisation of a crane">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Crane</label>
            <Select
              value={form?.equipmentId ?? ""}
              onChange={(v) => setForm((f) => (f ? { ...f, equipmentId: v } : f))}
              className="w-full"
              ariaLabel="Crane"
            >
              <option value="" disabled>Select crane…</option>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>{m.assetId}, {m.name}</option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Premob date</label>
              <DateField value={premobDate} onChange={setPremobDate} max={TODAY} required ariaLabel="Premob date" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Next due</label>
              <DateField value={nextDue} onChange={setNextDue} min={premobDate} required ariaLabel="Next premob due" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Vendor</label>
              <input name="vendor" required className={FIELD_CLASS} placeholder="Inspection company" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Certificate no. (optional)</label>
              <input name="certificateNumber" className={FIELD_CLASS} />
            </div>
          </div>
          <div>
            <label className={LABEL_CLASS}>Certificate or report</label>
            <input ref={fileRef} type="file" required accept={FILE_ACCEPT} className={FILE_CLASS} />
            <p className="text-xs text-ink-400 mt-1">PDF, photo or Word document. This is the proof the premob happened.</p>
          </div>
          <div>
            <label className={LABEL_CLASS}>Notes (optional)</label>
            <textarea name="notes" rows={2} className={FIELD_CLASS} placeholder="Conditions or findings noted by the vendor" />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" loading={saving}>Save premob</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={history !== null}
        onClose={() => setHistory(null)}
        title="Premob History"
        subtitle={history ? `${history.name} · ${history.assetId}` : ""}
      >
        {craneHistory.length === 0 ? (
          <EmptyState icon={FileCheck2} title="No premob recorded" message="The first premob you record for this crane starts its history." />
        ) : (
          <ul className="divide-y divide-line max-h-[60vh] overflow-y-auto">
            {craneHistory.map((r) => (
              <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900 tabular-nums">{formatDate(r.premobDate)} · {r.vendor}</p>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Next due {formatDate(r.nextDueDate)}
                    {r.recordedByName ? ` · recorded by ${r.recordedByName}` : ""}
                  </p>
                  {r.notes && <p className="text-xs text-ink-600 mt-1">{r.notes}</p>}
                </div>
                <a
                  href={`/api/files/${r.proofFileKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-brand-700 hover:underline shrink-0"
                >
                  {r.certificateNumber || "Certificate"}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
