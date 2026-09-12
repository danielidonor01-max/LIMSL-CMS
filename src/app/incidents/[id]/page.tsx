// src/app/incidents/[id]/page.tsx
// One incident: what was reported, and the investigation against it.
//
// The report is read-only once filed. What somebody saw at the time is evidence,
// and evidence that can be edited afterwards by whoever is investigating it is
// not evidence. The investigation is a separate, editable section beneath it.
"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Loader2, Save, Lock } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import Select from "@/components/Select";
import SignoffChain from "@/components/SignoffChain";
import { Badge } from "@/components/Badge";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import DateField from "@/components/DateField";
import { formatDate } from "@/lib/utils";
import { INCIDENT_INVESTIGATE_ROLES } from "@/lib/roles";
import {
  INCIDENT_TYPE_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_STATUS_BADGE,
  requiresFormalInvestigation,
} from "@/lib/hse/incidents";

export default function IncidentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = mounted ? (session?.user as { role?: string })?.role : undefined;
  const canInvestigate = !!role && INCIDENT_INVESTIGATE_ROLES.includes(role);

  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [immediateAction, setImmediateAction] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [status, setStatus] = useState("REPORTED");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/incidents/${id}`);
      if (!res.ok) return;
      const d = await res.json();
      setRecord(d);
      setImmediateAction(d.immediateAction ?? "");
      setRootCause(d.rootCause ?? "");
      setCorrectiveAction(d.correctiveAction ?? "");
      setTargetDate(d.targetDate ?? "");
      setStatus(d.status ?? "REPORTED");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (nextStatus?: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          immediateAction,
          rootCause,
          correctiveAction,
          targetDate: targetDate || null,
          status: nextStatus ?? status,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        // The reasons come back with the refusal, because the person closing it
        // is the person who has to fix whatever is missing.
        if (Array.isArray(d.blockers)) d.blockers.forEach((b: string) => toast.error(b));
        else toast.error(d.error || "Could not save.");
        return;
      }
      toast.success("Investigation saved.");
      await load();
    } catch {
      toast.error("Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-ink-500 gap-2 text-sm">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" /> Loading the report…
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center text-ink-500 text-sm">
        Incident not found.
      </div>
    );
  }

  const closed = record.status === "CLOSED";

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-3xl w-full mx-auto space-y-6">
        <PageHeader
          title={INCIDENT_TYPE_LABEL[record.type] ?? record.type}
          subtitle={`Reported by ${record.reportedByName ?? "unknown"} on ${formatDate(String(record.reportedAt).slice(0, 10))}`}
          code={record.incidentNumber}
          backHref="/incidents"
          backLabel="Incidents & near misses"
          actions={
            <Badge className={INCIDENT_STATUS_BADGE[record.status] ?? INCIDENT_STATUS_BADGE.REPORTED}>
              {INCIDENT_STATUS_LABEL[record.status] ?? record.status}
            </Badge>
          }
        />

        {/* What was reported. Read-only, permanently. */}
        <section className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-ink-400" />
            <h2 className="text-sm font-semibold text-ink-900">What was reported</h2>
          </div>
          <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-line">{record.description}</p>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-2 border-t border-line text-xs">
            <div>
              <dt className="text-ink-500">When</dt>
              <dd className="text-ink-900 font-medium tabular-nums mt-0.5">
                {String(record.occurredAt).replace("T", " ").slice(0, 16)}
              </dd>
            </div>
            <div>
              <dt className="text-ink-500">Where</dt>
              <dd className="text-ink-900 font-medium mt-0.5">{record.location || "Not recorded"}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Anyone hurt</dt>
              <dd className="text-ink-900 font-medium mt-0.5">
                {record.injuredPersonName || "Nobody"}
              </dd>
            </div>
            {record.assetId && (
              <div>
                <dt className="text-ink-500">Equipment</dt>
                <dd className="text-ink-900 font-medium mt-0.5">{record.assetId}</dd>
              </div>
            )}
            {record.witnesses && (
              <div className="col-span-2">
                <dt className="text-ink-500">Witnesses</dt>
                <dd className="text-ink-900 font-medium mt-0.5">{record.witnesses}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs text-ink-500 leading-relaxed">
            The report is fixed once filed. What somebody saw at the time is evidence, and evidence
            that can be rewritten afterwards is not evidence.
          </p>
        </section>

        {/* The investigation. */}
        <section className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-5">
          <h2 className="text-sm font-semibold text-ink-900">Investigation</h2>

          {!canInvestigate ? (
            <p className="text-xs text-ink-500 leading-relaxed">
              HSE and management record the investigation. The person who reported an event is
              rarely the person who should be attributing its root cause.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <label className={LABEL_CLASS}>What was done at the time</label>
                <textarea
                  value={immediateAction}
                  onChange={(e) => setImmediateAction(e.target.value)}
                  rows={2}
                  disabled={closed}
                  className={FIELD_CLASS}
                />
              </div>
              <div className="space-y-2">
                <label className={LABEL_CLASS}>
                  Root cause{requiresFormalInvestigation(record.type) ? " (required to close)" : ""}
                </label>
                <textarea
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  rows={3}
                  disabled={closed}
                  placeholder="Why it happened, not who did it."
                  className={FIELD_CLASS}
                />
              </div>
              <div className="space-y-2">
                <label className={LABEL_CLASS}>Corrective action</label>
                <textarea
                  value={correctiveAction}
                  onChange={(e) => setCorrectiveAction(e.target.value)}
                  rows={2}
                  disabled={closed}
                  placeholder="What stops this happening again."
                  className={FIELD_CLASS}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className={LABEL_CLASS}>Target date</label>
                  <DateField value={targetDate} onChange={setTargetDate} disabled={closed} />
                </div>
                <div className="space-y-2">
                  <label className={LABEL_CLASS}>Status</label>
                  <Select value={status} onChange={setStatus} className="w-full" disabled={closed}>
                    {Object.entries(INCIDENT_STATUS_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {record.blockers?.length > 0 && !closed && (
                <div className="rounded-lg border border-warn-200 bg-warn-50 p-3 text-xs text-warn-800 space-y-1">
                  <p className="font-semibold">Before this can be closed:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {record.blockers.map((b: string) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {!closed && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Button icon={Save} loading={saving} onClick={() => save()}>
                    Save investigation
                  </Button>
                  <Button variant="secondary" loading={saving} onClick={() => save("CLOSED")}>
                    Close the incident
                  </Button>
                </div>
              )}
            </>
          )}
        </section>

        <SignoffChain entityType="SAFETY_INCIDENT" entityId={record.id} title="Investigation sign-off" />
      </main>
    </div>
  );
}
