// src/components/SessionClose.tsx
// How a troubleshooting session ends (LIMSL, 27 Nov 2026). Three answers, and a
// cause that needs a repair always lands on a breakdown record: the one the
// session already belongs to, an open one on this machine, or a new one raised
// here. The rules are lib/maintenance/troubleshooting.ts; the route enforces
// them, this only asks the questions in the right order.
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import Button from "@/components/Button";
import Field, { FIELD_CLASS } from "@/components/Field";
import Select from "@/components/Select";
import { closeError, outcomeNeedsBreakdown, type Outcome } from "@/lib/maintenance/troubleshooting";

type Breakdown = { id: string; cmrfNumber: string };
export type CloseResult = {
  status: "RESOLVED" | "ABANDONED";
  outcome: Outcome;
  breakdown: Breakdown | null;
  raisedBreakdown: boolean;
  learned: string | null;
};

const CHOICES: { value: Exclude<Outcome, "ABANDONED">; label: string; help: string }[] = [
  { value: "CAUSE_FOUND", label: "Cause found", help: "You know what is wrong." },
  { value: "SPECIALIST", label: "Needs a specialist", help: "It needs the OEM or an outside expert." },
  { value: "NO_FAULT", label: "No fault found", help: "Checked, and nothing needs repairing." },
];

export default function SessionClose({
  assetId,
  equipmentId,
  sessionId,
  breakdown,
  suggestedCause,
  onCancel,
  onClosed,
}: {
  assetId: string;
  equipmentId: string;
  sessionId: string;
  /** The breakdown this session already belongs to, if any. */
  breakdown: Breakdown | null;
  /** The assistant's latest likely cause, offered as a starting point. */
  suggestedCause?: string | null;
  onCancel: () => void;
  onClosed: (r: CloseResult) => void;
}) {
  const [outcome, setOutcome] = useState<Exclude<Outcome, "ABANDONED">>("CAUSE_FOUND");
  const [cause, setCause] = useState(suggestedCause ?? "");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<{ id: string; cmrfNumber: string; faultDescription: string | null }[]>([]);
  const [where, setWhere] = useState<"attach" | "raise">("raise");
  const [attachId, setAttachId] = useState("");
  const [urgency, setUrgency] = useState("MEDIUM");
  const [saving, setSaving] = useState(false);

  // The open breakdowns on this machine, to attach to.
  useEffect(() => {
    if (breakdown) return;
    fetch("/api/corrective")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; cmrfNumber: string; equipmentId: string; status: string; faultDescription: string | null }[]) => {
        const mine = (Array.isArray(rows) ? rows : []).filter((r) => r.equipmentId === equipmentId && r.status !== "CLOSED");
        setOpen(mine);
        if (mine.length) {
          setWhere("attach");
          setAttachId(mine[0].id);
        }
      })
      .catch(() => {});
  }, [breakdown, equipmentId]);

  const needsBreakdown = outcomeNeedsBreakdown(outcome);
  const request = {
    outcome,
    resolvedCause: outcome === "CAUSE_FOUND" ? cause : null,
    note,
    linkedCorrectiveId: breakdown?.id ?? null,
    attachCorrectiveId: !breakdown && needsBreakdown && where === "attach" ? attachId || null : null,
    raiseBreakdown: !breakdown && needsBreakdown && where === "raise",
  };
  const problem = closeError(request);

  const submit = async () => {
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      const res = await fetch(`/api/equipment/${assetId}/diagnose/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resolve",
          sessionId,
          outcome,
          resolvedCause: request.resolvedCause,
          resolutionNote: note,
          attachCorrectiveId: request.attachCorrectiveId,
          raiseBreakdown: request.raiseBreakdown,
          urgency,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not close the session.");
        return;
      }
      onClosed(d as CloseResult);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-line bg-ink-50 p-4 space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-ink-900 mb-2">How did it end?</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {CHOICES.map((c) => (
            <label
              key={c.value}
              className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
                outcome === c.value ? "border-brand-500 bg-brand-50" : "border-line bg-surface hover:border-ink-300"
              }`}
            >
              <input
                type="radio"
                name="ts-outcome"
                value={c.value}
                checked={outcome === c.value}
                onChange={() => setOutcome(c.value)}
                className="sr-only"
              />
              <span className="font-semibold text-ink-900 block">{c.label}</span>
              <span className="text-xs text-ink-500">{c.help}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {outcome === "CAUSE_FOUND" && (
        <Field label="What caused it" htmlFor="ts-cause" required help="Goes to the breakdown as a suggested root cause. The technician verifies it there.">
          <input id="ts-cause" value={cause} onChange={(e) => setCause(e.target.value)} className={`${FIELD_CLASS} bg-surface`} placeholder="e.g. Contactor K3 welded shut" />
        </Field>
      )}
      <Field
        label={outcome === "NO_FAULT" ? "What was checked" : outcome === "SPECIALIST" ? "What is needed from the specialist" : "What was done (optional)"}
        htmlFor="ts-note"
        required={outcome !== "CAUSE_FOUND"}
      >
        <input id="ts-note" value={note} onChange={(e) => setNote(e.target.value)} className={`${FIELD_CLASS} bg-surface`} />
      </Field>

      {needsBreakdown &&
        (breakdown ? (
          <p className="text-sm text-ink-700">
            This goes on <span className="font-semibold">{breakdown.cmrfNumber}</span>, the breakdown this session belongs to.
          </p>
        ) : (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-ink-900 mb-1">Which breakdown does it go on?</legend>
            <label className="flex items-center gap-2 text-sm text-ink-800">
              <input type="radio" name="ts-where" checked={where === "attach"} onChange={() => setWhere("attach")} disabled={open.length === 0} className="accent-brand-600" />
              An open breakdown on this machine{open.length === 0 ? " (there are none)" : ""}
            </label>
            {where === "attach" && open.length > 0 && (
              <Select value={attachId} onChange={setAttachId} ariaLabel="Open breakdown" className="w-full">
                {open.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.cmrfNumber} · {(b.faultDescription || "fault reported").slice(0, 80)}
                  </option>
                ))}
              </Select>
            )}
            <label className="flex items-center gap-2 text-sm text-ink-800">
              <input type="radio" name="ts-where" checked={where === "raise"} onChange={() => setWhere("raise")} className="accent-brand-600" />
              Raise a new breakdown, with this session&apos;s symptom as the fault
            </label>
            {where === "raise" && (
              <Select value={urgency} onChange={setUrgency} ariaLabel="Urgency" className="w-full sm:w-60">
                <option value="LOW">Low urgency</option>
                <option value="MEDIUM">Medium urgency</option>
                <option value="HIGH">High urgency</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            )}
          </fieldset>
        ))}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" icon={CheckCircle2} loading={saving} disabled={!!problem} onClick={submit}>
          Close the session
        </Button>
      </div>
    </div>
  );
}
