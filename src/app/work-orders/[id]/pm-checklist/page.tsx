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
  Save,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import SignaturePad from "@/components/SignaturePad";
import { formatDate } from "@/lib/utils";

type Item = { item: string; status: string; remarks: string };
type User = { id: string; name: string; role: string };

const STATUS_OPTIONS = ["OK", "NOT_OK", "NA"];

const DEFAULTS: Record<string, string[]> = {
  visual: [
    "General cleanliness & housekeeping",
    "Structural frame / guards intact",
    "Fasteners & mounting secure",
    "Leaks (oil / coolant / air)",
    "Labels & warning signage legible",
    "Cables & hoses condition",
  ],
  functional: [
    "Startup / shutdown sequence",
    "Controls & indicators respond",
    "Movement / travel smooth",
    "Limit switches / interlocks",
    "Emergency stop functional",
    "Abnormal noise / vibration",
  ],
  lubrication: [
    "Gearbox oil level & condition",
    "Grease points serviced",
    "Hydraulic fluid level",
    "Filters inspected / cleaned",
  ],
  electrical: [
    "Panel tightness & cleanliness",
    "Contactors / relays condition",
    "Earthing continuity",
    "Motor condition & temperature",
    "Indicator lamps operational",
  ],
};

const mkItems = (labels: string[]): Item[] =>
  labels.map((l) => ({ item: l, status: "OK", remarks: "" }));

export default function PMChecklistPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [wo, setWo] = useState<any>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [safety, setSafety] = useState({ ptwIssued: false, lotoApplied: false, ppeWorn: false, areaSafe: false });
  const [visual, setVisual] = useState<Item[]>(mkItems(DEFAULTS.visual));
  const [functional, setFunctional] = useState<Item[]>(mkItems(DEFAULTS.functional));
  const [lubrication, setLubrication] = useState<Item[]>(mkItems(DEFAULTS.lubrication));
  const [electrical, setElectrical] = useState<Item[]>(mkItems(DEFAULTS.electrical));

  const [observations, setObservations] = useState("");
  const [correctiveActionRequired, setCorrectiveActionRequired] = useState(false);
  const [actionDescription, setActionDescription] = useState("");
  const [sparePartsNeeded, setSparePartsNeeded] = useState("");
  const [nextPMDate, setNextPMDate] = useState("");

  const [technicianName, setTechnicianName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [technicianSignature, setTechnicianSignature] = useState<string | null>(null);
  const [supervisorSignature, setSupervisorSignature] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [woData, userData] = await Promise.all([
        fetch(`/api/work-orders/${id}`).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/users").then((r) => r.json()),
      ]);
      setWo(woData);
      setUsers(Array.isArray(userData) ? userData : []);
      if (woData?.technicianName) setTechnicianName(woData.technicianName);
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

  const submit = async () => {
    setError(null);
    if (!allSafetyOk) {
      setError("All safety pre-checks (PTW, LOTO, PPE, Area Safe) must be confirmed before completing PM.");
      return;
    }
    if (!technicianName.trim() || !technicianSignature) {
      setError("Technician name and signature are required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/pm-checklists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Submit failed");
      }
      router.push(`/work-orders/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
      </div>
    );
  }
  if (!wo || wo.error) {
    return (
      <div className="min-h-screen bg-[#0b0f19] text-slate-100 font-sans">
        <AppHeader />
        <div className="p-16 text-center text-slate-400">
          Work order not found.{" "}
          <Link href="/work-orders" className="text-emerald-400 hover:underline">Back</Link>
        </div>
      </div>
    );
  }

  const eq = wo.equipment;
  const sectionCls = "bg-[#0f172a]/40 border border-slate-800 rounded-xl p-6 space-y-4";
  const heading = "text-sm font-semibold text-slate-200 flex items-center gap-2";
  const num = (n: number) =>
    <span className="w-5 h-5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex items-center justify-center">{n}</span>;
  const field = "w-full px-3 py-2 bg-slate-900/50 border border-slate-800 rounded-lg text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/40";

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      <AppHeader />
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-5">
        <Link href={`/work-orders/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to {wo.workOrderNumber}
        </Link>

        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Preventive Maintenance Checklist</h2>
            <p className="text-xs text-slate-400 font-mono">{wo.workOrderNumber} · Complete & sign off</p>
          </div>
        </div>

        {/* 1. Equipment info */}
        <div className={sectionCls}>
          <h3 className={heading}>{num(1)} Equipment Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <Info label="Equipment" value={eq?.name} />
            <Info label="Asset ID" value={eq?.assetId} mono />
            <Info label="Location" value={eq?.location} />
            <Info label="Frequency" value={eq?.maintenanceFrequency?.replace(/_/g, " ")} />
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
            <div className="flex items-center gap-2 text-[11px] text-amber-400">
              <ShieldAlert className="w-3.5 h-3.5" /> All four must be confirmed before sign-off.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
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
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-slate-900/40 border-slate-800 text-slate-300"
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
          <label className="flex items-center gap-2 text-xs text-slate-300">
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
              <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Next PM Date</label>
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
              <select
                value={supervisorName}
                onChange={(e) => setSupervisorName(e.target.value)}
                className={field}
              >
                <option value="">Supervisor (optional)…</option>
                {users
                  .filter((u) => u.role === "SUPERVISOR" || u.role === "MANAGEMENT")
                  .map((u) => (
                    <option key={u.id} value={u.name}>{u.name}</option>
                  ))}
              </select>
              <SignaturePad label="Supervisor Signature" onChange={setSupervisorSignature} />
            </div>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pb-8">
          <Link
            href={`/work-orders/${id}`}
            className="px-4 py-2 text-xs font-semibold text-slate-300 border border-slate-800 rounded-lg hover:bg-slate-800/50"
          >
            Cancel
          </Link>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Submitting…" : "Complete & Sign Off PM"}
          </button>
        </div>
      </main>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{label}</p>
      <p className={`text-slate-200 mt-0.5 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
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
    <div className="bg-[#0f172a]/40 border border-slate-800 rounded-xl p-6 space-y-3">
      <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
        <span className="w-5 h-5 rounded bg-emerald-500/15 text-emerald-400 text-[10px] font-bold flex items-center justify-center">{n}</span>
        {title}
      </h3>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-xs text-slate-300 flex-1">{it.item}</span>
            <div className="flex gap-1">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange(i, { status: s })}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold border transition-all ${
                    it.status === s
                      ? s === "OK"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : s === "NOT_OK"
                          ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          : "bg-slate-500/15 text-slate-300 border-slate-500/30"
                      : "bg-slate-900/40 text-slate-500 border-slate-800 hover:text-slate-300"
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
              className="sm:w-40 px-2 py-1 bg-slate-900/50 border border-slate-800 rounded-md text-[11px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
