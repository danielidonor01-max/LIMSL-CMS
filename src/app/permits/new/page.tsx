// src/app/permits/new/page.tsx
// The permit face, in the order it appears on paper. Someone who has filled the
// printed form for years should recognise this screen, and someone holding both
// should not have to translate between them.
"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck, Loader2, FileText, ShieldAlert, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import Select from "@/components/Select";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import TriStateChecklist, { type TriState } from "@/components/TriStateChecklist";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { ROLE_LABELS } from "@/lib/roles";
import {
  PERMIT_WORK_TYPES,
  ZONE_CLASSIFICATIONS,
  REQUIRED_DOCUMENTS,
  WORK_AREA_PRECAUTIONS,
  PPE_REQUIREMENTS,
  mandatoryPrecautionsFor,
  missingMandatoryPrecautions,
} from "@/lib/hse/permit-form";
import { DEFAULT_PERMIT_VALIDITY_DAYS, expiryDateOf } from "@/lib/hse/permit-validity";

type Marks = Record<string, TriState>;

function NewPermitForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillEquipmentId = searchParams.get("equipmentId") || "";
  const prefillJhaId = searchParams.get("jhaId") || "";

  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]);
  const [jhaList, setJhaList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [jhaId, setJhaId] = useState(prefillJhaId);
  const [taskNo, setTaskNo] = useState("");
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [facility, setFacility] = useState("Factory");
  const [workArea, setWorkArea] = useState("");
  const [zoneClassification, setZoneClassification] = useState<string>(ZONE_CLASSIFICATIONS[0]);
  const [equipmentId, setEquipmentId] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("08:00");
  const [durationHours, setDurationHours] = useState("8");
  const [workerCount, setWorkerCount] = useState("1");
  const [permitDepartment, setPermitDepartment] = useState("HSE");
  const [validityDays, setValidityDays] = useState(String(DEFAULT_PERMIT_VALIDITY_DAYS));
  const [permitHolderId, setPermitHolderId] = useState("");

  const [documentMarks, setDocumentMarks] = useState<Marks>({});
  const [precautionMarks, setPrecautionMarks] = useState<Marks>({});
  const [ppeMarks, setPpeMarks] = useState<Marks>({});
  const [additionalRequirements, setAdditionalRequirements] = useState("");
  const [lotoApplied, setLotoApplied] = useState(false);
  const [areaBarricaded, setAreaBarricaded] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/equipment").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/users").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/jha").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([eqs, users, jhas]) => {
        setEquipmentList(Array.isArray(eqs) ? eqs : []);
        setUserList(Array.isArray(users) ? users : []);
        setJhaList(Array.isArray(jhas) ? jhas.filter((j: any) => j.status === "APPROVED") : []);
        if (prefillEquipmentId && Array.isArray(eqs) && eqs.some((e: any) => e.id === prefillEquipmentId)) {
          setEquipmentId(prefillEquipmentId);
        }
      })
      .catch(() => toast.error("Could not load the permit form data."))
      .finally(() => setLoading(false));
  }, [prefillEquipmentId]);

  const selectedJha = useMemo(() => jhaList.find((j) => j.id === jhaId), [jhaList, jhaId]);

  // The analysis already names the machine, the area and the PPE. Retyping them
  // onto the permit is how the two documents end up disagreeing.
  useEffect(() => {
    if (!selectedJha) return;
    if (selectedJha.equipmentId && !equipmentId) setEquipmentId(selectedJha.equipmentId);
    if (selectedJha.workArea && !workArea) setWorkArea(selectedJha.workArea);
    if (!workDescription && selectedJha.title) setWorkDescription(selectedJha.title);
  }, [selectedJha, equipmentId, workArea, workDescription]);

  const mandatory = useMemo(() => mandatoryPrecautionsFor(workTypes).map((m) => m.key), [workTypes]);
  const missing = useMemo(
    () => missingMandatoryPrecautions(workTypes, precautionMarks),
    [workTypes, precautionMarks],
  );

  const expiresOn = useMemo(() => {
    const days = Number(validityDays);
    if (!startDate || !Number.isFinite(days) || days < 1) return null;
    return expiryDateOf(startDate, days);
  }, [startDate, validityDays]);

  const toggleWorkType = (value: string) =>
    setWorkTypes((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!jhaId) return toast.error("Select the approved Job Hazard Analysis this permit is issued against.");
    if (workTypes.length === 0) return toast.error("Select at least one type of work.");
    if (!equipmentId) return toast.error("Select the machine or system being worked on.");
    if (!workDescription.trim()) return toast.error("Describe the work.");
    if (!permitHolderId) return toast.error("Name the permit holder.");
    if (missing.length > 0) {
      return toast.error(`The work type selected requires: ${missing.join(", ")}.`);
    }

    setSaving(true);
    try {
      const res = await fetch("/api/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jhaId,
          taskNo: taskNo.trim() || null,
          workTypes,
          facility: facility.trim() || null,
          workArea: workArea.trim() || null,
          zoneClassification,
          equipmentId,
          workDescription: workDescription.trim(),
          startDate,
          startTime,
          durationHours: durationHours ? Number(durationHours) : null,
          workerCount: workerCount ? Number(workerCount) : null,
          permitDepartment,
          validityDays: Number(validityDays),
          permitHolderId,
          documentMarks,
          precautionMarks,
          ppeMarks,
          additionalRequirements: additionalRequirements.trim() || null,
          lotoApplied,
          areaBarricaded,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not raise the permit.");
        return;
      }
      toast.success(`${d.permitNumber} raised. It needs the full signature chain before work may begin.`);
      router.push(`/permits/${d.id}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto space-y-6">
        <PageHeader
          icon={ShieldCheck}
          title="Raise a Permit to Work"
          subtitle="The last document in the chain. It authorises the work, records the week it ran, and closes it."
          backHref="/permits"
          backLabel="Permits"
        />

        <form onSubmit={submit} className="space-y-6">
          {/* The chain behind the permit */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-emerald-600" /> Approved hazard analysis
            </h3>
            <Select value={jhaId} onChange={setJhaId} className="w-full">
              <option value="">Select the analysis this permit is issued against</option>
              {jhaList.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jhaNumber} · {j.title}
                </option>
              ))}
            </Select>
            {jhaList.length === 0 ? (
              <p className="text-[11px] text-amber-700">
                No approved hazard analysis yet. The chain runs work order, then method statement,
                then hazard analysis, then this permit, and each one has to be approved before the
                next can be raised.
              </p>
            ) : (
              selectedJha && (
                <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                  {selectedJha.wmsNumber && (
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {selectedJha.wmsNumber}
                    </span>
                  )}
                  <span>The work order and method statement are inherited from this analysis.</span>
                </div>
              )
            )}
          </div>

          {/* Type of work */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Type of work</h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Determines which controls are mandatory below.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {PERMIT_WORK_TYPES.map((t) => {
                  const on = workTypes.includes(t.value);
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => toggleWorkType(t.value)}
                      aria-pressed={on}
                      className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                        on
                          ? "bg-emerald-600 border-emerald-600 text-white"
                          : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={LABEL_CLASS}>Facility</label>
                <input value={facility} onChange={(e) => setFacility(e.target.value)} className={FIELD_CLASS} />
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
              <div>
                <label className={LABEL_CLASS}>Zone classification</label>
                <Select value={zoneClassification} onChange={setZoneClassification} className="w-full">
                  {ZONE_CLASSIFICATIONS.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Machine or system</label>
              <Select value={equipmentId} onChange={setEquipmentId} className="w-full">
                <option value="">Select</option>
                {equipmentList.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.assetId} · {e.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className={LABEL_CLASS}>Description of work</label>
              <textarea
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                rows={2}
                placeholder="e.g. Cutting of metal plates"
                className={FIELD_CLASS}
              />
            </div>
          </div>

          {/* Timing and validity */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900">When and who</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className={LABEL_CLASS}>Start date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Duration (hours)</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Number of workers</label>
                <input
                  type="number"
                  min="1"
                  value={workerCount}
                  onChange={(e) => setWorkerCount(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={LABEL_CLASS}>Permit department</label>
                <input
                  value={permitDepartment}
                  onChange={(e) => setPermitDepartment(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Validity period (days)</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={validityDays}
                  onChange={(e) => setValidityDays(e.target.value)}
                  className={FIELD_CLASS}
                />
                {expiresOn && (
                  <p className="text-[10px] text-slate-500 mt-1">Expires after {expiresOn}.</p>
                )}
              </div>
              <div>
                <label className={LABEL_CLASS}>Task no.</label>
                <input
                  value={taskNo}
                  onChange={(e) => setTaskNo(e.target.value)}
                  placeholder="From the paper pad"
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Permit holder</label>
              <Select value={permitHolderId} onChange={setPermitHolderId} className="w-full">
                <option value="">Select the person the permit is issued to</option>
                {userList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {ROLE_LABELS[u.role] ?? u.role}
                  </option>
                ))}
              </Select>
              <p className="text-[10px] text-slate-500 mt-1">
                He signs the permit himself, and nobody signs that line for him.
              </p>
            </div>
          </div>

          {/* The checklists */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-emerald-600" /> The permit checklists
            </h3>

            <TriStateChecklist
              title="Required documents to be attached"
              items={REQUIRED_DOCUMENTS}
              value={documentMarks}
              onChange={setDocumentMarks}
            />

            <TriStateChecklist
              title="Work area and safety precautions"
              hint="Ticked means in place. Crossed means not required for this job."
              items={WORK_AREA_PRECAUTIONS}
              value={precautionMarks}
              onChange={setPrecautionMarks}
              highlightKeys={mandatory}
            />

            <TriStateChecklist
              title="PPE requirement"
              items={PPE_REQUIREMENTS}
              value={ppeMarks}
              onChange={setPpeMarks}
            />

            {missing.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-amber-900">
                  The type of work selected requires these controls
                </p>
                <p className="text-[11px] text-amber-800 mt-0.5">{missing.join(", ")}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={lotoApplied}
                  onChange={(e) => setLotoApplied(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                Lock-out / tag-out applied
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={areaBarricaded}
                  onChange={(e) => setAreaBarricaded(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600"
                />
                Area barricaded
              </label>
            </div>

            <div>
              <label className={LABEL_CLASS}>Additional requirements</label>
              <textarea
                value={additionalRequirements}
                onChange={(e) => setAdditionalRequirements(e.target.value)}
                rows={2}
                placeholder="e.g. Adhere to all HSE standards and procedures"
                className={FIELD_CLASS}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => router.push("/permits")}>
              Cancel
            </Button>
            <Button type="submit" icon={ShieldCheck} loading={saving}>
              Raise permit
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

export default function NewPermit() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-slate-500">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        </div>
      }
    >
      <NewPermitForm />
    </Suspense>
  );
}
