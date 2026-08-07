// src/app/training/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/api-cache";
import {
  GraduationCap,
  Plus,
  ClipboardCheck,
  AlertTriangle,
  CheckCircle2,
  CalendarClock,
  Award,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { TRAINING_WRITE_ROLES, ROLE_LABELS } from "@/lib/roles";
import { toast } from "sonner";

type Competency = {
  id: string;
  employeeName: string;
  role: string | null;
  skillArea: string;
  category: string | null;
  level: number;
  requiredLevel: number | null;
  assessedBy: string | null;
  assessedDate: string | null;
  expiryDate: string | null;
};

type Training = {
  id: string;
  employeeName: string | null;
  trainingTitle: string;
  category: string | null;
  type: string | null;
  trainer: string | null;
  plannedDate: string | null;
  actualDate: string | null;
  certificateIssued: boolean | null;
  status: string | null;
};

const LEVELS = ["None", "Aware", "Competent", "Proficient", "Expert"];
const LEVEL_CLS = [
  "bg-slate-100 text-slate-400 border-slate-200",
  "bg-sky-500/10 text-sky-700 border-sky-500/20",
  "bg-teal-500/10 text-teal-700 border-teal-500/20",
  "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  "bg-emerald-600 text-white border-emerald-700",
];

const TODAY = new Date().toISOString().slice(0, 10);

const isRecertDue = (c: Competency) =>
  !!c.expiryDate && new Date(c.expiryDate).getTime() < Date.now() + 30 * 864e5;

export default function TrainingPage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && TRAINING_WRITE_ROLES.includes(role ?? "");

  const { data: trainingData, loading, refresh } = useApi<{
    competencies?: Competency[];
    trainings?: Training[];
  }>("/api/training", {});
  const competencies = trainingData.competencies ?? [];
  const trainings = trainingData.trainings ?? [];
  const [saving, setSaving] = useState(false);
  const [showAssess, setShowAssess] = useState(false);
  const [showTraining, setShowTraining] = useState(false);

  // Select renders a button (no form field), so these selections are held in
  // state instead of being read back from FormData on submit.
  const [assessCategory, setAssessCategory] = useState("TECHNICAL");
  const [assessLevel, setAssessLevel] = useState("2");
  const [assessRequiredLevel, setAssessRequiredLevel] = useState("2");
  const [trainCategory, setTrainCategory] = useState("TECHNICAL");
  const [trainType, setTrainType] = useState("INTERNAL");

  const loadData = () => {
    refresh();
  };

  useEffect(() => setMounted(true), []);

  // Distinct people and skill areas → build the matrix grid.
  const { people, skills, cell } = useMemo(() => {
    const people = Array.from(new Set(competencies.map((c) => c.employeeName)));
    const skills = Array.from(new Set(competencies.map((c) => c.skillArea)));
    const cell = new Map<string, Competency>();
    competencies.forEach((c) => cell.set(`${c.employeeName}|||${c.skillArea}`, c));
    return { people, skills, cell };
  }, [competencies]);

  const summary = useMemo(() => {
    const gaps = competencies.filter((c) => c.level < (c.requiredLevel ?? 0)).length;
    const recerts = competencies.filter(isRecertDue).length;
    const planned = trainings.filter((t) => t.status === "PLANNED").length;
    const completed = trainings.filter((t) => t.status === "COMPLETED").length;
    return { gaps, recerts, planned, completed };
  }, [competencies, trainings]);

  async function submitAssessment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const res = await fetch("/api/competency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: fd.get("employeeName"),
          skillArea: fd.get("skillArea"),
          category: assessCategory,
          level: Number(assessLevel),
          requiredLevel: Number(assessRequiredLevel),
          expiryDate: fd.get("expiryDate") || null,
        }),
      });
      if (res.ok) {
        toast.success("Competency assessment recorded.");
        setShowAssess(false);
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to record assessment.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function submitTraining(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      const res = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName: fd.get("employeeName"),
          trainingTitle: fd.get("trainingTitle"),
          category: trainCategory,
          type: trainType,
          trainer: fd.get("trainer"),
          plannedDate: fd.get("plannedDate") || null,
          duration: fd.get("duration"),
        }),
      });
      if (res.ok) {
        toast.success("Training scheduled.");
        setShowTraining(false);
        await loadData();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Failed to schedule training.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function completeTraining(id: string) {
    const res = await fetch("/api/training", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "COMPLETED", certificateIssued: true }),
    });
    if (res.ok) {
      toast.success("Training marked complete.");
      await loadData();
    } else {
      toast.error("Failed to update training.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <PageHeader
          icon={GraduationCap}
          title="Training & Competency"
          subtitle="Who is qualified to do what, where the gaps are, and what training is booked"
          actions={
            canWrite ? (
              <>
                <Button
                  variant="secondary"
                  icon={ClipboardCheck}
                  onClick={() => {
                    setAssessCategory("TECHNICAL");
                    setAssessLevel("2");
                    setAssessRequiredLevel("2");
                    setShowAssess(true);
                  }}
                >
                  Record Assessment
                </Button>
                <Button
                  icon={Plus}
                  onClick={() => {
                    setTrainCategory("TECHNICAL");
                    setTrainType("INTERNAL");
                    setShowTraining(true);
                  }}
                >
                  Schedule Training
                </Button>
              </>
            ) : undefined
          }
        />

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <TableSkeleton rows={6} cols={6} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Competency Gaps" value={summary.gaps} tone="border-rose-200 bg-rose-50" text="text-rose-600" />
              <Stat label="Recert Due ≤30d" value={summary.recerts} tone="border-amber-200 bg-amber-50" text="text-amber-600" />
              <Stat label="Planned Training" value={summary.planned} tone="border-sky-200 bg-sky-50" text="text-sky-600" />
              <Stat label="Completed" value={summary.completed} tone="border-emerald-200 bg-emerald-50" text="text-emerald-600" />
            </div>

            {/* Competency Matrix */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Competency Matrix</h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {LEVELS.map((l, i) => (
                    <span key={l} className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${LEVEL_CLS[i]}`}>
                      {i} · {l}
                    </span>
                  ))}
                </div>
              </div>
              {people.length === 0 ? (
                <EmptyState
                  icon={ClipboardCheck}
                  title="No competency assessments recorded"
                  message="The skills matrix builds itself from assessments. Record the first one to see who is qualified for what, and where the gaps are."
                  actionLabel={canWrite ? "Record Assessment" : undefined}
                  onAction={
                    canWrite
                      ? () => {
                          setAssessCategory("TECHNICAL");
                          setAssessLevel("2");
                          setAssessRequiredLevel("2");
                          setShowAssess(true);
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-3 px-4 font-medium sticky left-0 bg-white">Personnel</th>
                        {skills.map((s) => (
                          <th key={s} className="py-3 px-3 font-medium text-center min-w-[110px] align-bottom">
                            {s}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {people.map((p) => {
                        const anyRow = competencies.find((c) => c.employeeName === p);
                        return (
                          <tr key={p} className="hover:bg-slate-50">
                            <td className="py-3 px-4 sticky left-0 bg-white">
                              <div className="font-medium text-slate-900">{p}</div>
                              {anyRow?.role && (
                                <div className="text-[10px] text-slate-500">{ROLE_LABELS[anyRow.role] ?? anyRow.role}</div>
                              )}
                            </td>
                            {skills.map((s) => {
                              const c = cell.get(`${p}|||${s}`);
                              if (!c) return <td key={s} className="py-3 px-3 text-center text-slate-300">—</td>;
                              const gap = c.level < (c.requiredLevel ?? 0);
                              const recert = isRecertDue(c);
                              return (
                                <td key={s} className="py-3 px-3 text-center">
                                  <span
                                    title={`${LEVELS[c.level]} (required ${c.requiredLevel ?? 0})${recert ? " · recert due" : ""}`}
                                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold border ${LEVEL_CLS[c.level]} ${gap ? "ring-2 ring-rose-400" : ""}`}
                                  >
                                    {c.level}
                                  </span>
                                  {recert && <div className="text-[8px] text-amber-600 font-semibold mt-0.5">RECERT</div>}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {summary.gaps > 0 && (
                <div className="px-5 py-3 border-t border-slate-200 flex items-center gap-2 text-[11px] text-rose-600">
                  <AlertTriangle className="w-3.5 h-3.5" /> {summary.gaps} competency gap{summary.gaps > 1 ? "s" : ""} below required level (ringed) — schedule training to close.
                </div>
              )}
            </div>

            {/* Training Register */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-900">Training Register</h3>
              </div>
              {trainings.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="No training booked or completed"
                  message="Schedule training against a person to close a competency gap and keep certificates current."
                  actionLabel={canWrite ? "Schedule Training" : undefined}
                  onAction={
                    canWrite
                      ? () => {
                          setTrainCategory("TECHNICAL");
                          setTrainType("INTERNAL");
                          setShowTraining(true);
                        }
                      : undefined
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 px-5 font-medium">Training</th>
                        <th className="py-2.5 px-4 font-medium">Attendee</th>
                        <th className="py-2.5 px-4 font-medium">Type</th>
                        <th className="py-2.5 px-4 font-medium">Planned</th>
                        <th className="py-2.5 px-4 font-medium">Status</th>
                        <th className="py-2.5 px-4 font-medium">Cert</th>
                        {canWrite && <th className="py-2.5 px-4 font-medium"></th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {trainings.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-5">
                            <div className="font-medium text-slate-900">{t.trainingTitle}</div>
                            {t.trainer && <div className="text-[10px] text-slate-500">by {t.trainer}</div>}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">{t.employeeName ?? "—"}</td>
                          <td className="py-2.5 px-4 text-slate-500">{t.type ?? "—"}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-500">{formatDate(t.plannedDate)}</td>
                          <td className="py-2.5 px-4">
                            <Badge
                              className={
                                t.status === "COMPLETED"
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                  : t.status === "CANCELLED"
                                  ? "bg-slate-500/10 text-slate-500 border-slate-500/20"
                                  : "bg-amber-500/10 text-amber-600 border-amber-500/20"
                              }
                            >
                              {t.status}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4">
                            {t.certificateIssued ? (
                              <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-semibold">
                                <Award className="w-3.5 h-3.5" /> Issued
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">—</span>
                            )}
                          </td>
                          {canWrite && (
                            <td className="py-2.5 px-4">
                              {t.status !== "COMPLETED" && t.status !== "CANCELLED" && (
                                <button
                                  onClick={() => completeTraining(t.id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Complete
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Record Assessment modal */}
      <Modal open={showAssess} onClose={() => setShowAssess(false)} title="Record Competency Assessment" subtitle="Person × skill area proficiency">
        <form onSubmit={submitAssessment} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Employee Name</label>
              <input name="employeeName" required className={FIELD_CLASS} list="people-list" defaultValue="" />
              <datalist id="people-list">
                {people.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <div>
              <label className={LABEL_CLASS}>Skill Area</label>
              <input name="skillArea" required className={FIELD_CLASS} list="skills-list" defaultValue="" />
              <datalist id="skills-list">
                {skills.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <label className={LABEL_CLASS}>Category</label>
              <Select value={assessCategory} onChange={setAssessCategory} className="w-full">
                <option value="TECHNICAL">Technical</option>
                <option value="HSE">HSE</option>
                <option value="QA_QC">QA/QC</option>
                <option value="OEM">OEM</option>
              </Select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Assessed Level</label>
              <Select value={assessLevel} onChange={setAssessLevel} className="w-full">
                {LEVELS.map((l, i) => <option key={l} value={i}>{i} · {l}</option>)}
              </Select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Required Level</label>
              <Select value={assessRequiredLevel} onChange={setAssessRequiredLevel} className="w-full">
                {LEVELS.map((l, i) => <option key={l} value={i}>{i} · {l}</option>)}
              </Select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Recert Due (optional)</label>
              <input name="expiryDate" type="date" className={FIELD_CLASS} />
            </div>
          </div>
          <SubmitRow saving={saving} onCancel={() => setShowAssess(false)} label="Save Assessment" />
        </form>
      </Modal>

      {/* Schedule Training modal */}
      <Modal open={showTraining} onClose={() => setShowTraining(false)} title="Schedule Training" subtitle="Add to the training register">
        <form onSubmit={submitTraining} className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Training Title</label>
            <input name="trainingTitle" required className={FIELD_CLASS} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>Attendee</label>
              <input name="employeeName" required className={FIELD_CLASS} list="people-list" />
            </div>
            <div>
              <label className={LABEL_CLASS}>Trainer</label>
              <input name="trainer" className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Category</label>
              <Select value={trainCategory} onChange={setTrainCategory} className="w-full">
                <option value="TECHNICAL">Technical</option>
                <option value="HSE">HSE</option>
                <option value="QA_QC">QA/QC</option>
                <option value="OEM">OEM</option>
              </Select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Type</label>
              <Select value={trainType} onChange={setTrainType} className="w-full">
                <option value="INTERNAL">Internal</option>
                <option value="EXTERNAL">External</option>
                <option value="OEM">OEM</option>
              </Select>
            </div>
            <div>
              <label className={LABEL_CLASS}>Planned Date</label>
              <input name="plannedDate" type="date" className={FIELD_CLASS} defaultValue={TODAY} />
            </div>
            <div>
              <label className={LABEL_CLASS}>Duration</label>
              <input name="duration" className={FIELD_CLASS} placeholder="e.g. 1 day" />
            </div>
          </div>
          <SubmitRow saving={saving} onCancel={() => setShowTraining(false)} label="Schedule Training" />
        </form>
      </Modal>
    </div>
  );
}

function SubmitRow({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex gap-3 justify-end pt-2">
      <Button variant="secondary" type="button" onClick={onCancel}>Cancel</Button>
      <Button variant="primary" type="submit" loading={saving}>{label}</Button>
    </div>
  );
}

function Stat({ label, value, tone, text }: { label: string; value: number; tone: string; text: string }) {
  return (
    <div className={`p-4 rounded-xl border ${tone}`}>
      <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <div className={`text-2xl font-bold mt-2 ${text}`}>{value}</div>
    </div>
  );
}
