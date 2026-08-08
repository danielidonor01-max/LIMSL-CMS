// src/app/work-orders/[id]/pm-checklist/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  ClipboardCheck,
  ShieldAlert,
  ShieldCheck,
  Save,
  RotateCcw,
} from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import Modal from "@/components/Modal";
import Select from "@/components/Select";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useDraft } from "@/lib/use-draft";
import { jobPlanFor, hasBespokePlan, type JobTask } from "@/lib/maintenance/job-plans";
import { FREQUENCY_LABELS } from "@/lib/constants";
import { submitOrQueue } from "@/lib/offline/use-outbox";

type Item = { item: string; status: string; remarks: string; criteria?: string; unit?: string; value?: string };
type User = { id: string; name: string; role: string };

const STATUS_OPTIONS = ["OK", "NOT_OK", "NA"];

// Nothing starts ticked. Every item arrived pre-set to "OK", so a "complete"
// checklist could be filed without a single line being read — the PM record
// became a formality. A deliberate answer per item is the whole point.
const mkItems = (tasks: JobTask[]): Item[] =>
  tasks.map((t) => ({ item: t.item, status: "", remarks: "", criteria: t.criteria, unit: t.unit, value: "" }));

export default function PMChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [wo, setWo] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [safety, setSafety] = useState({ ptwIssued: false, lotoApplied: false, ppeWorn: false, areaSafe: false });
  const [visual, setVisual] = useState<Item[]>([]);
  const [functional, setFunctional] = useState<Item[]>([]);
  const [lubrication, setLubrication] = useState<Item[]>([]);
  const [electrical, setElectrical] = useState<Item[]>([]);
  const [planTitle, setPlanTitle] = useState("");
  const [planIsGeneric, setPlanIsGeneric] = useState(false);

  const [observations, setObservations] = useState("");
  const [correctiveActionRequired, setCorrectiveActionRequired] = useState(false);
  const [actionDescription, setActionDescription] = useState("");
  const [sparePartsNeeded, setSparePartsNeeded] = useState("");
  const [nextPMDate, setNextPMDate] = useState("");

  const [technicianName, setTechnicianName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [technicianSignature, setTechnicianSignature] = useState<string | null>(null);
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [attested, setAttested] = useState(false);

  // ~30 inputs filled standing at a machine on workshop wifi. Losing them to a
  // backgrounded browser or a dropped connection cost the technician the whole
  // visit, so the form keeps a local draft and offers it back on return.
  const draftValue = {
    visual, functional, lubrication, electrical,
    observations, correctiveActionRequired, actionDescription, sparePartsNeeded, nextPMDate,
  };
  const { draft, clearDraft, dismissDraft } = useDraft(id ? `pm:${id}` : null, draftValue);
  const restoreDraft = () => {
    if (!draft) return;
    setVisual(draft.visual);
    setFunctional(draft.functional);
    setLubrication(draft.lubrication);
    setElectrical(draft.electrical);
    setObservations(draft.observations);
    setCorrectiveActionRequired(draft.correctiveActionRequired);
    setActionDescription(draft.actionDescription);
    setSparePartsNeeded(draft.sparePartsNeeded);
    setNextPMDate(draft.nextPMDate);
    dismissDraft();
    toast.success("Your unsaved checklist was restored.");
  };

  useEffect(() => {
    async function load() {
      const [woData, userData] = await Promise.all([
        fetch(`/api/work-orders/${id}`).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/users").then((r) => r.json()),
      ]);
      setWo(woData);
      setUsers(Array.isArray(userData) ? userData : []);
      if (woData?.technicianName) setTechnicianName(woData.technicianName);

      // The checklist is the machine's OWN task list. A crane gets brake-wear
      // and rope checks; a compressor gets separator dP; an earthing system
      // gets loop impedance — instead of all three getting "gearbox oil level".
      const category = woData?.equipment?.category ?? null;
      const plan = jobPlanFor(category);
      setPlanTitle(plan.title);
      setPlanIsGeneric(!hasBespokePlan(category));
      for (const section of plan.sections) {
        const items = mkItems(section.tasks);
        if (section.key === "visual") setVisual(items);
        else if (section.key === "functional") setFunctional(items);
        else if (section.key === "lubrication") setLubrication(items);
        else if (section.key === "electrical") setElectrical(items);
      }
      // Default next PM ~ +90 days
      setNextPMDate(new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10));
      setLoading(false);
    }
    load();
  }, [id]);

  const allSafetyOk = useMemo(
    () => safety.ptwIssued && safety.lotoApplied && safety.ppeWorn && safety.areaSafe,
    [safety],
  );

  const setItem = (
    list: Item[],
    setter: (v: Item[]) => void,
    idx: number,
    patch: Partial<Item>,
  ) => setter(list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  // Validate, then open the attestation modal — the technician must confirm the
  // PTW and safety controls were actually signed and true before we submit.
  const requestSubmit = () => {
    setError(null);
    if (!allSafetyOk) {
      setError("All safety pre-checks (PTW, LOTO, PPE, Area Safe) must be confirmed before completing PM.");
      return;
    }
    if (!technicianName.trim() || !technicianSignature) {
      setError("Technician name and signature are required.");
      return;
    }
    // Every task needs a deliberate answer. An unanswered item is not "OK" —
    // it is a task nobody performed, and filing it as complete would be a
    // false record.
    const unanswered = [...visual, ...functional, ...lubrication, ...electrical].filter((i) => !i.status);
    if (unanswered.length) {
      setError(
        `${unanswered.length} task${unanswered.length === 1 ? " has" : "s have"} no result recorded — ` +
        `mark each OK, NOT OK or NA. First: "${unanswered[0].item}".`,
      );
      return;
    }
    setAttested(false);
    setShowConfirm(true);
  };

  const submit = async () => {
    setError(null);
    setShowConfirm(false);
    setSaving(true);
    try {
      // Signal drops in the workshop. Rather than failing in front of someone
      // who has just filled in a 21-item checklist twice, park it and send it
      // when the connection returns.
      const outcome = await submitOrQueue({
        url: "/api/pm-checklists",
        label: `PM checklist — ${wo?.equipment?.assetId ?? "work order"} ${wo?.workOrderNumber ?? ""}`.trim(),
        dedupeKey: `pm-checklist:${id}`,
        body: {
          workOrderId: id,
          equipmentId: wo.equipmentId,
          date: new Date().toISOString().slice(0, 10),
          ...safety,
          visualInspection: visual,
          functionalTests: functional,
          lubrication,
          electricalChecks: electrical,
          observations,
          correctiveActionRequired,
          actionDescription,
          sparePartsNeeded,
          pmCompleted: true,
          nextPMDate,
          technicianName,
          supervisorName,
          technicianSignature,
          supervisorSignature,
        },
      });

      if (!outcome.ok) throw new Error(outcome.error);

      if (!outcome.sent) {
        // Keep the draft: nothing is filed until the queue drains, and the
        // outbox tray is now carrying it.
        toast.success("Saved on this phone — it will file itself once you have signal.");
        router.push(`/work-orders/${id}`);
        return;
      }

      if (!outcome.response.ok) {
        const d = await outcome.response.json().catch(() => ({}));
        throw new Error(d.error || "Submit failed");
      }
      clearDraft();
      toast.success("PM checklist filed.");
      router.push(`/work-orders/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }
  if (!wo || wo.error) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <div className="p-16 text-center text-slate-500">
          Work order not found.{" "}
          <Link href="/work-orders" className="text-emerald-600 hover:underline">Back</Link>
        </div>
      </div>
    );
  }

  const eq = wo.equipment;
  const sectionCls = "bg-white border border-slate-200 rounded-xl p-6 space-y-4";
  const heading = "text-sm font-semibold text-slate-900 flex items-center gap-2";
  const num = (n: number) =>
    <span className="w-5 h-5 rounded bg-emerald-500/15 text-emerald-600 text-[10px] font-bold flex items-center justify-center">{n}</span>;
  const field = "w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/40";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-5">
        <Link href={`/work-orders/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to {wo.workOrderNumber}
        </Link>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Preventive Maintenance Checklist</h2>
            <p className="text-xs text-slate-500 font-mono">{wo.workOrderNumber} · Complete & sign off</p>
          </div>
        </div>

        {/* Offer back what the last visit left unsaved — never apply it
            silently, since a stale draft could overwrite a fresh start. */}
        {draft && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <RotateCcw className="w-4 h-4 text-amber-700 shrink-0" />
            <p className="text-xs text-amber-900 flex-1 min-w-[12rem]">
              You have an unfinished checklist for this work order saved on this device.
            </p>
            <button
              onClick={restoreDraft}
              className="min-h-11 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
            >
              Restore it
            </button>
            <button
              onClick={dismissDraft}
              className="min-h-11 px-3 text-xs font-semibold text-amber-800 hover:text-amber-950"
            >
              Start fresh
            </button>
          </div>
        )}

        {/* Name the task list in use, and be honest when it's the generic
            fallback rather than a plan written for this machine type. */}
        {planTitle && (
          <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs ${
            planIsGeneric ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-100 bg-sky-50 text-sky-900"
          }`}>
            <ClipboardCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Task list: <strong>{planTitle}</strong>.
              {planIsGeneric
                ? " No plan is defined for this equipment category yet, so the general machine list is in use — record anything type-specific under observations."
                : " Tasks and acceptance criteria are specific to this equipment category."}
            </p>
          </div>
        )}

        {/* 1. Equipment info */}
        <div className={sectionCls}>
          <h3 className={heading}>{num(1)} Equipment Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <Info label="Equipment" value={eq?.name} />
            <Info label="Asset ID" value={eq?.assetId} mono />
            <Info label="Location" value={eq?.location} />
            <Info label="Service interval" value={FREQUENCY_LABELS[eq?.maintenanceFrequency ?? ""] ?? eq?.maintenanceFrequency} />
            <Info label="OEM" value={eq?.oem} />
            <Info label="Serial" value={eq?.serialNumber} mono />
            <Info label="Date" value={formatDate(new Date().toISOString())} />
            <Info label="Technician" value={wo.technicianName} />
          </div>
        </div>

        {/* 2. Safety pre-checks */}
        <div className={sectionCls}>
          <h3 className={heading}>{num(2)} Safety Pre-Checks</h3>
          {!allSafetyOk && (
            <div className="flex items-center gap-2 text-[11px] text-amber-600">
              <ShieldAlert className="w-3.5 h-3.5" /> All four must be confirmed before sign-off.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              ["ptwIssued", "Permit-to-Work (PTW) issued"],
              ["lotoApplied", "LOTO applied"],
              ["ppeWorn", "PPE worn"],
              ["areaSafe", "Work area safe & barricaded"],
            ].map(([key, label]) => (
              <label
                key={key}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer text-xs ${
                  safety[key as keyof typeof safety]
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                    : "bg-slate-100 border-slate-200 text-slate-700"
                }`}
              >
                <input
                  type="checkbox"
                  checked={safety[key as keyof typeof safety]}
                  onChange={(e) => setSafety((s) => ({ ...s, [key]: e.target.checked }))}
                  className="accent-emerald-500 w-4 h-4"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* 3-6 inspection sections */}
        <ChecklistEditor n={3} title="Visual & Physical Inspection" items={visual} onChange={(i, p) => setItem(visual, setVisual, i, p)} />
        <ChecklistEditor n={4} title="Functional Tests" items={functional} onChange={(i, p) => setItem(functional, setFunctional, i, p)} />
        <ChecklistEditor n={5} title="Lubrication & Consumables" items={lubrication} onChange={(i, p) => setItem(lubrication, setLubrication, i, p)} />
        <ChecklistEditor n={6} title="Electrical Checks" items={electrical} onChange={(i, p) => setItem(electrical, setElectrical, i, p)} />

        {/* 8. Findings */}
        <div className={sectionCls}>
          <h3 className={heading}>{num(7)} Findings & Corrective Actions</h3>
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={3}
            placeholder="Observations, abnormalities, measurements…"
            className={field}
          />
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={correctiveActionRequired}
              onChange={(e) => setCorrectiveActionRequired(e.target.checked)}
              className="accent-amber-500 w-4 h-4"
            />
            Corrective action required (equipment will be flagged Under Maintenance)
          </label>
          {correctiveActionRequired && (
            <textarea
              value={actionDescription}
              onChange={(e) => setActionDescription(e.target.value)}
              rows={2}
              placeholder="Describe the corrective action needed…"
              className={field}
            />
          )}
          <input
            value={sparePartsNeeded}
            onChange={(e) => setSparePartsNeeded(e.target.value)}
            placeholder="Spare parts needed (if any)"
            className={field}
          />
        </div>

        {/* 9. Completion & sign-off */}
        <div className={sectionCls}>
          <h3 className={heading}>{num(8)} Completion & Sign-Off</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Next PM Date</label>
              <input type="date" value={nextPMDate} onChange={(e) => setNextPMDate(e.target.value)} className={field} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <input
                value={technicianName}
                onChange={(e) => setTechnicianName(e.target.value)}
                placeholder="Technician name *"
                className={field}
              />
              <SignaturePad label="Technician Signature *" onChange={setTechnicianSignature} />
            </div>
            <div className="space-y-2">
              <Select
                value={supervisorName}
                onChange={(v) => setSupervisorName(v)}
                className="w-full"
              >
                <option value="">Supervisor (optional)…</option>
                {users
                  .filter((u) => ["FOREMAN", "MAINTENANCE_MANAGER", "FACTORY_MANAGER"].includes(u.role))
                  .map((u) => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
              </Select>
              <SignaturePad label="Supervisor Signature" onChange={setSupervisorSignature} />
            </div>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-700 text-xs">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pb-8">
          <Link
            href={`/work-orders/${id}`}
            className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100"
          >
            Cancel
          </Link>
          <button
            onClick={requestSubmit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Submitting…" : "Complete & Sign Off PM"}
          </button>
        </div>
      </main>

      {/* Safety attestation — confirm PTW & controls were actually signed and true */}
      <Modal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Confirm safety sign-off"
        subtitle="Attestation before PM completion"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              You are completing PM for <strong>{wo?.workOrderNumber}</strong>. If a Permit-to-Work is attached to
              this job, it must already be <strong>signed off and active</strong> — the server will reject this
              submission otherwise.
            </span>
          </div>
          <ul className="space-y-2 text-xs">
            {[
              ["Permit-to-Work (PTW) issued and signed", safety.ptwIssued],
              ["Lock-out / Tag-out (LOTO) applied", safety.lotoApplied],
              ["PPE worn as required", safety.ppeWorn],
              ["Work area safe & barricaded", safety.areaSafe],
            ].map(([label, ok]) => (
              <li key={label as string} className="flex items-center gap-2">
                <ShieldCheck className={`w-4 h-4 ${ok ? "text-emerald-600" : "text-slate-300"}`} />
                <span className={ok ? "text-slate-800" : "text-slate-400"}>{label as string}</span>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={attested}
              onChange={(e) => setAttested(e.target.checked)}
              className="mt-0.5 rounded border-slate-300 text-emerald-500"
            />
            <span>
              I confirm the above safety controls were <strong>actually carried out and signed off</strong>, and this
              PM record is true and complete.
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={!attested || saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Confirm &amp; Submit
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-slate-900 mt-0.5 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

function ChecklistEditor({
  n,
  title,
  items,
  onChange,
}: {
  n: number;
  title: string;
  items: Item[];
  onChange: (idx: number, patch: Partial<Item>) => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
        <span className="w-5 h-5 rounded bg-emerald-500/15 text-emerald-600 text-[10px] font-bold flex items-center justify-center">{n}</span>
        {title}
      </h3>
      <div className="space-y-2">
        {/* This is the most-tapped control in the product — sixty-plus of them
            per checklist, pressed on a phone, often with gloves on. They were
            22px tall and 4px apart. Full-width segmented control at the touch
            floor, stacked on small screens. */}
        {items.map((it, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:items-start gap-2 py-2 border-b border-slate-100 last:border-0">
            <div className="flex-1 min-w-0">
              <span className="text-sm sm:text-xs text-slate-700">{it.item}</span>
              {/* What "OK" actually means — a tick against an unstated standard
                  is not evidence. */}
              {it.criteria && <p className="text-[11px] text-slate-400 mt-0.5">{it.criteria}</p>}
            </div>
            {it.unit && (
              <input
                value={it.value ?? ""}
                onChange={(e) => onChange(i, { value: e.target.value })}
                inputMode="decimal"
                placeholder={it.unit}
                aria-label={`Measured value for ${it.item} in ${it.unit}`}
                className="w-full sm:w-24 min-h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm sm:text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              />
            )}
            <div
              className="flex gap-1 w-full sm:w-auto shrink-0"
              role="group"
              aria-label={`Result for ${it.item}`}
            >
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={it.status === s}
                  onClick={() => onChange(i, { status: s })}
                  className={`flex-1 sm:flex-none sm:min-w-[68px] min-h-11 px-3 rounded-lg text-xs font-semibold border transition-colors ${
                    it.status === s
                      ? s === "OK"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : s === "NOT_OK"
                          ? "bg-rose-600 text-white border-rose-600"
                          : "bg-slate-600 text-white border-slate-600"
                      : it.status
                        ? "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700"
                        : "bg-white text-slate-500 border-dashed border-slate-300 hover:border-slate-400 hover:text-slate-700"
                  }`}
                >
                  {s === "NOT_OK" ? "NOT OK" : s}
                </button>
              ))}
            </div>
            <input
              value={it.remarks}
              onChange={(e) => onChange(i, { remarks: e.target.value })}
              placeholder="Remarks"
              aria-label={`Remarks for ${it.item}`}
              className="sm:w-40 min-h-11 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm sm:text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
