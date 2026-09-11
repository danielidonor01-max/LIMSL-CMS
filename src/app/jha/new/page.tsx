// src/app/jha/new/page.tsx
"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Save, Loader2 } from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import ChainPreview from "@/components/ChainPreview";
import { JHA_CHAIN } from "@/lib/signoff/chains";
import Select from "@/components/Select";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { PPE_REQUIREMENTS } from "@/lib/hse/permit-form";
import { LIKELIHOOD, SEVERITY, rate, BAND_LABEL, BAND_TONE } from "@/lib/hse/risk-matrix";

type StepRow = {
  step: string;
  hazards: string;
  controls: string;
  responsible: string;
  likelihoodBefore: number;
  severityBefore: number;
  likelihoodAfter: number;
  severityAfter: number;
};

const emptyStep = (): StepRow => ({
  step: "",
  hazards: "",
  controls: "",
  // Deliberately started at the middle of both scales rather than the bottom.
  // A form that opens on "rare / negligible" gets submitted on rare and
  // negligible, and the rating means nothing.
  likelihoodBefore: 3,
  severityBefore: 3,
  likelihoodAfter: 2,
  severityAfter: 3,
  responsible: "",
});

function NewJhaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [wmsList, setWmsList] = useState<{ id: string; wmsNumber: string; title: string; status: string }[]>([]);
  const [equipmentList, setEquipmentList] = useState<{ id: string; name: string; assetId: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const [wmsId, setWmsId] = useState(searchParams.get("wmsId") ?? "");
  const [title, setTitle] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [workArea, setWorkArea] = useState("");
  const [emergencyArrangements, setEmergencyArrangements] = useState("");
  const [ppe, setPpe] = useState<string[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([emptyStep()]);

  useEffect(() => {
    fetch("/api/wms")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setWmsList(Array.isArray(d) ? d.filter((w) => w.status === "APPROVED") : []))
      .catch(() => setWmsList([]));
    fetch("/api/equipment")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEquipmentList(Array.isArray(d) ? d : []))
      .catch(() => setEquipmentList([]));
  }, []);

  // Naming the analysis after the method statement it covers saves retyping and
  // keeps the two findable together.
  const selectedWms = useMemo(() => wmsList.find((w) => w.id === wmsId), [wmsList, wmsId]);
  useEffect(() => {
    if (selectedWms && !title.trim()) setTitle(`Job Hazard Analysis, ${selectedWms.title}`);
  }, [selectedWms, title]);

  const setStep = (i: number, patch: Partial<StepRow>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const togglePpe = (key: string) =>
    setPpe((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wmsId) {
      toast.error("Select the approved Work Method Statement this analysis covers.");
      return;
    }
    const usable = steps.filter((s) => s.step.trim() && s.hazards.trim() && s.controls.trim());
    if (usable.length === 0) {
      toast.error("Add at least one job step with its hazards and controls.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/jha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wmsId,
          title: title.trim(),
          equipmentId: equipmentId || null,
          workArea: workArea.trim() || null,
          emergencyArrangements: emergencyArrangements.trim() || null,
          ppeRequired: ppe,
          steps: usable,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not create the analysis.");
        return;
      }
      toast.success(`${d.jhaNumber} raised and sent for approval.`);
      router.push(`/jha/${d.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-5xl w-full mx-auto space-y-8">
        <PageHeader
          title="New Job Hazard Analysis"
          subtitle="Break the approved method into steps and state the hazard and control for each"
          backHref="/jha"
          backLabel="Hazard analyses"
        />

        <form onSubmit={submit} className="space-y-8">
          <div className="bg-surface border border-line rounded-2xl shadow-card p-6 space-y-4">
            <div>
              <label className={LABEL_CLASS}>Approved Work Method Statement</label>
              <Select value={wmsId} onChange={setWmsId} className="w-full">
                <option value="">Select the method statement being analysed</option>
                {wmsList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.wmsNumber} · {w.title}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-ink-500 mt-1">
                {wmsList.length === 0
                  ? "No approved method statements yet. A WMS must finish its approval chain before it can be analysed."
                  : "Only approved method statements appear here. Analysing an unapproved method assesses work that may still change."}
              </p>
            </div>

            <div>
              <label className={LABEL_CLASS}>Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Job Hazard Analysis for ..."
                className={FIELD_CLASS}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Machine</label>
                <Select value={equipmentId} onChange={setEquipmentId} className="w-full">
                  <option value="">Not machine-specific</option>
                  {equipmentList.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.assetId} · {e.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Work area</label>
                <input
                  value={workArea}
                  onChange={(e) => setWorkArea(e.target.value)}
                  placeholder="e.g. Bay 1"
                  className={FIELD_CLASS}
                />
              </div>
            </div>
          </div>

          <div className="bg-surface border border-line rounded-2xl shadow-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink-900">Job steps</h3>
                <p className="text-xs text-ink-500 mt-0.5">
                  One row per step of the job. Every step needs its hazard and the control for it.
                </p>
              </div>
              <Button type="button" variant="secondary" icon={Plus} onClick={() => setSteps([...steps, emptyStep()])}>
                Add step
              </Button>
            </div>

            <div className="space-y-3">
              {steps.map((s, i) => (
                <div key={i} className="border border-ink-200 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 text-[11px] font-mono font-semibold text-ink-400 w-5 shrink-0">
                      {i + 1}
                    </span>
                    <input
                      value={s.step}
                      onChange={(e) => setStep(i, { step: e.target.value })}
                      placeholder="Job step, what is being done"
                      className={FIELD_CLASS}
                    />
                    {steps.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                        className="mt-1.5 text-ink-400 hover:text-danger-600 shrink-0"
                        aria-label={`Remove step ${i + 1}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-7">
                    <textarea
                      value={s.hazards}
                      onChange={(e) => setStep(i, { hazards: e.target.value })}
                      placeholder="Hazards, what can hurt someone here"
                      rows={2}
                      className={FIELD_CLASS}
                    />
                    <textarea
                      value={s.controls}
                      onChange={(e) => setStep(i, { controls: e.target.value })}
                      placeholder="Controls, what stops it"
                      rows={2}
                      className={FIELD_CLASS}
                    />
                  </div>
                  {/* Scored twice. The pair is what makes a control provable:
                      "high risk" is a description, "high risk brought to low by
                      these controls" is a safety case. */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 pl-7">
                    <RiskScore
                      title="Before controls"
                      likelihood={s.likelihoodBefore}
                      severity={s.severityBefore}
                      onLikelihood={(v) => setStep(i, { likelihoodBefore: v })}
                      onSeverity={(v) => setStep(i, { severityBefore: v })}
                    />
                    <RiskScore
                      title="After controls"
                      likelihood={s.likelihoodAfter}
                      severity={s.severityAfter}
                      onLikelihood={(v) => setStep(i, { likelihoodAfter: v })}
                      onSeverity={(v) => setStep(i, { severityAfter: v })}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-7">
                    <div>
                      <label className={LABEL_CLASS}>Responsible</label>
                      <input
                        value={s.responsible}
                        onChange={(e) => setStep(i, { responsible: e.target.value })}
                        placeholder="Who holds this control"
                        className={FIELD_CLASS}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-line rounded-2xl shadow-card p-6 space-y-4">
            <div>
              <label className={LABEL_CLASS}>PPE required</label>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {PPE_REQUIREMENTS.map((p) => {
                  const on = ppe.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => togglePpe(p.key)}
                      aria-pressed={on}
                      className={`px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        on
                          ? "bg-brand-600 border-brand-600 text-white"
                          : "bg-white border-ink-200 text-ink-600 hover:border-ink-300"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-ink-500 mt-1.5">
                Carried onto the permit raised against this analysis.
              </p>
            </div>

            <div>
              <label className={LABEL_CLASS}>Emergency arrangements</label>
              <textarea
                value={emergencyArrangements}
                onChange={(e) => setEmergencyArrangements(e.target.value)}
                placeholder="Muster point, first aider, who to call, how the job is made safe if it has to stop"
                rows={3}
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <ChainPreview
            steps={JHA_CHAIN}
            note="No permit may be raised against a hazard analysis that has not finished this chain."
          />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push("/jha")}>
              Cancel
            </Button>
            <Button type="submit" icon={Save} loading={saving}>
              Raise for approval
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

// One half of a step's rating. The score and its band are shown live, because a
// person choosing "likely" and "major" should see 4 x 4 = 16, extreme, at the
// moment they choose it rather than after submitting.
function RiskScore({
  title,
  likelihood,
  severity,
  onLikelihood,
  onSeverity,
}: {
  title: string;
  likelihood: number;
  severity: number;
  onLikelihood: (v: number) => void;
  onSeverity: (v: number) => void;
}) {
  const r = rate(likelihood, severity);
  return (
    <div className="border border-line rounded-lg p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-700">{title}</p>
        {r && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${BAND_TONE[r.band]}`}>
            {r.score} · {BAND_LABEL[r.band]}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={LABEL_CLASS}>Likelihood</label>
          <Select value={String(likelihood)} onChange={(v) => onLikelihood(Number(v))} className="w-full">
            {LIKELIHOOD.map((l) => (
              <option key={l.value} value={String(l.value)}>
                {l.value} · {l.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className={LABEL_CLASS}>Severity</label>
          <Select value={String(severity)} onChange={(v) => onSeverity(Number(v))} className="w-full">
            {SEVERITY.map((sv) => (
              <option key={sv.value} value={String(sv.value)}>
                {sv.value} · {sv.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}

// useSearchParams suspends, so the page needs a boundary or the build cannot
// prerender it.
export default function NewJhaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-ink-500">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      }
    >
      <NewJhaForm />
    </Suspense>
  );
}
