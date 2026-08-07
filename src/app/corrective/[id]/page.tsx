// src/app/corrective/[id]/page.tsx
"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  Loader2,
  Calendar,
  User,
  Wrench,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Plus,
  Trash2,
} from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import SignoffChain from "@/components/SignoffChain";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { useDraft } from "@/lib/use-draft";
import { productionDowntimeHours, type WorkSettings, DEFAULT_WORK_SETTINGS } from "@/lib/worktime";

export default function CorrectiveDetail({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { data: session } = useSession();
  const currentUserName = (session?.user as { name?: string })?.name ?? "";
  const resolvedParams = use(params);
  const recordId = resolvedParams.id;

  const [record, setRecord] = useState<any>(null);
  const [equipment, setEquipment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // RCA Form states
  const [rcaTool, setRcaTool] = useState("FIVE_WHYS");
  const [why1, setWhy1] = useState("");
  const [why2, setWhy2] = useState("");
  const [why3, setWhy3] = useState("");
  const [why4, setWhy4] = useState("");
  const [why5, setWhy5] = useState("");
  const [rootCauseCategory, setRootCauseCategory] = useState("MECHANICAL");
  const [verifiedRootCause, setVerifiedRootCause] = useState("");

  // Corrective Actions (CATL)
  const [actions, setActions] = useState<any[]>([]);
  const [newAction, setNewAction] = useState("");
  const [newResp, setNewResp] = useState("");
  const [newDate, setNewDate] = useState("");

  // Signatures
  const [techSign, setTechSign] = useState("");
  const [superSign, setSuperSign] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [supervisorComments, setSupervisorComments] = useState("");

  // Downtime window — production hours are derived from these against the
  // working-hours settings, so a weekend or off-shift outage isn't over-counted.
  const [downStartAt, setDownStartAt] = useState("");
  const [downEndAt, setDownEndAt] = useState("");
  const [workSettings, setWorkSettings] = useState<WorkSettings>(DEFAULT_WORK_SETTINGS);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/corrective/${recordId}`);
        if (res.ok) {
          const data = await res.json();
          setRecord(data);

          // Seed the downtime window. Default the "down" moment to the reported
          // day at the start of shift so the technician only adjusts if needed.
          setDownStartAt(data.downStartAt || (data.reportedDate ? `${data.reportedDate}T08:00` : ""));
          setDownEndAt(data.downEndAt || "");

          // Load RCA fields if pre-existing
          if (data.rcaTool) setRcaTool(data.rcaTool);
          if (data.rcaAnalysis) {
            const parsed = JSON.parse(data.rcaAnalysis);
            setWhy1(parsed.why1 || "");
            setWhy2(parsed.why2 || "");
            setWhy3(parsed.why3 || "");
            setWhy4(parsed.why4 || "");
            setWhy5(parsed.why5 || "");
          }
          if (data.rootCauseCategory) setRootCauseCategory(data.rootCauseCategory);
          if (data.verifiedRootCause) setVerifiedRootCause(data.verifiedRootCause);

          // Load Actions
          if (data.correctiveActions) {
            setActions(JSON.parse(data.correctiveActions));
          }

          // Fetch Equipment details
          if (data.equipmentId) {
            const eqRes = await fetch(`/api/equipment`);
            if (eqRes.ok) {
              const eqData = await eqRes.json();
              const found = eqData.find((e: any) => e.id === data.equipmentId);
              if (found) setEquipment(found);
            }
          }
        }

        // Working-hours settings drive the downtime preview (server recomputes on save).
        const setRes = await fetch("/api/settings");
        if (setRes.ok) {
          const s = await setRes.json();
          if (s && !s.error) {
            setWorkSettings({
              workDayStart: s.workDayStart,
              workDayEnd: s.workDayEnd,
              lunchStart: s.lunchStart,
              lunchEnd: s.lunchEnd,
              workingDays: s.workingDays,
              weekendOvertime: s.weekendOvertime,
            });
          }
        }
      } catch (err) {
        console.error("Error loading corrective details:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [recordId]);

  const previewDowntime =
    downStartAt && downEndAt ? productionDowntimeHours(downStartAt, downEndAt, workSettings) : null;

  const addAction = () => {
    if (!newAction || !newResp) return;
    setActions([...actions, { action: newAction, responsible: newResp, date: newDate, status: "AWAITING" }]);
    setNewAction("");
    setNewResp("");
    setNewDate("");
  };

  const removeAction = (index: number) => {
    setActions(actions.filter((_, i) => i !== index));
  };

  const toggleActionStatus = (index: number) => {
    setActions(
      actions.map((act, i) =>
        i === index ? { ...act, status: act.status === "COMPLETED" ? "AWAITING" : "COMPLETED" } : act
      )
    );
  };

  // The 5 Whys plus an action list is a long sit-down on a phone or a laptop in
  // the workshop; keep a local draft so a dropped connection or a closed tab
  // doesn't cost the whole investigation.
  const { draft, clearDraft, dismissDraft } = useDraft(
    recordId ? `rca:${recordId}` : null,
    { why1, why2, why3, why4, why5, rootCauseCategory, verifiedRootCause, actions },
  );
  const restoreDraft = () => {
    if (!draft) return;
    setWhy1(draft.why1);
    setWhy2(draft.why2);
    setWhy3(draft.why3);
    setWhy4(draft.why4);
    setWhy5(draft.why5);
    setRootCauseCategory(draft.rootCauseCategory);
    setVerifiedRootCause(draft.verifiedRootCause);
    setActions(draft.actions);
    dismissDraft();
    toast.success("Your unsaved analysis was restored.");
  };

  // The RCA fields as the API expects them. Close-out sends these TOO — a
  // technician who fills the 5 Whys and closes out without first pressing
  // "Save RCA Analysis" used to lose the entire analysis silently.
  const rcaPayload = () => ({
    rcaTool,
    rcaAnalysis: { why1, why2, why3, why4, why5 },
    rootCauseCategory,
    verifiedRootCause,
    correctiveActions: actions,
  });

  const handleSaveRca = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/corrective/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rcaPayload()),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Couldn't save the RCA — check your connection and try again.");
        return;
      }
      clearDraft();
      toast.success("RCA and corrective actions saved.");
    } catch {
      toast.error("Couldn't save the RCA — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseOut = async () => {
    if (!techSign || !superSign) {
      toast.error("Both technician and supervisor signatures are required to close out the request.");
      return;
    }
    if (!supervisorName.trim()) {
      toast.error("Enter the approving supervisor's name.");
      return;
    }
    if (!downStartAt || !downEndAt) {
      toast.error("Record when the machine went down and when it was restored — this drives MTTR.");
      return;
    }
    if (new Date(downEndAt).getTime() <= new Date(downStartAt).getTime()) {
      toast.error("Restored time must be after the machine went down.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/corrective/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The RCA rides along so closing out can never discard it.
          ...rcaPayload(),
          status: "CLOSED",
          technicianSignature: techSign,
          // technicianName is stamped from the session server-side — the client
          // is not trusted to name the signer.
          supervisorSignature: superSign,
          supervisorName: supervisorName.trim(),
          supervisorComments,
          // The window is the source of truth; the server recomputes production
          // downtime hours from it against the working-hours settings.
          downStartAt,
          downEndAt,
          restoredToServiceTime: downEndAt,
          closeOutDate: new Date().toISOString().split("T")[0],
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Couldn't close out the record — your entries are still here, try again.");
        return;
      }
      clearDraft();
      toast.success("Breakdown closed out.");
      router.push("/corrective");
    } catch {
      toast.error("Couldn't close out the record — your entries are still here, try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-mono text-xs gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-rose-500" /> Loading report detail logs...
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-500 text-sm">
        <p>Corrective record not found.</p>
        <Link href="/corrective" className="text-rose-600 hover:underline">Back to corrective register</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <PageHeader
            icon={AlertTriangle}
            tone="rose"
            title="Breakdown Record"
            subtitle="Fault report, root-cause analysis and close-out"
            code={record.cmrfNumber}
            backHref="/corrective"
            backLabel="Corrective Maintenance"
          />
        </div>
        {/* Left Side: Fault Spec & RCA */}
        <div className="lg:col-span-2 space-y-6">
          {/* Fault Specifications Card */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Breakdown Specifications</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Equipment Name</span>
                {equipment?.assetId ? (
                  <Link
                    href={`/equipment/${equipment.assetId.replace(/\//g, "-")}`}
                    className="font-semibold text-emerald-700 hover:underline"
                  >
                    {equipment.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-slate-900">{equipment?.name || "Loading..."}</span>
                )}
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Tag ID</span>
                <span className="font-semibold text-slate-900 font-mono">{equipment?.assetId}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Status at failure</span>
                <span className="font-semibold text-slate-900 font-mono">{record.operatingStatusAtFailure}</span>
              </div>
            </div>

            <div className="text-xs space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block">Reported Fault Description</span>
              <p className="bg-slate-100 p-3 rounded border border-slate-200 text-slate-700 leading-relaxed">
                {record.faultDescription}
              </p>
            </div>
          </div>

          {/* Offer back an unfinished investigation rather than losing it. */}
          {draft && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-900 flex-1 min-w-[12rem]">
                You have an unsaved root-cause analysis for this breakdown on this device.
              </p>
              <button
                onClick={restoreDraft}
                className="min-h-11 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold"
              >
                Restore it
              </button>
              <button onClick={dismissDraft} className="min-h-11 px-3 text-xs font-semibold text-amber-800 hover:text-amber-950">
                Discard
              </button>
            </div>
          )}

          {/* Root Cause Analysis (RCA) Card */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-5">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Root Cause Analysis (RCA)</h2>
              <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono font-semibold text-slate-500">
                {rcaTool.replace("_", " ")}
              </span>
            </div>

            {/* 5 Whys fields */}
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[11px] font-mono text-slate-500 uppercase">1. Why did the machine fail?</span>
                <input
                  type="text"
                  value={why1}
                  onChange={(e) => setWhy1(e.target.value)}
                  placeholder="First level cause..."
                  className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-mono text-slate-500 uppercase">2. Why did that happen?</span>
                <input
                  type="text"
                  value={why2}
                  onChange={(e) => setWhy2(e.target.value)}
                  placeholder="Second level cause..."
                  className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-mono text-slate-500 uppercase">3. Why was that?</span>
                <input
                  type="text"
                  value={why3}
                  onChange={(e) => setWhy3(e.target.value)}
                  placeholder="Third level cause..."
                  className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-mono text-slate-500 uppercase">4. Why?</span>
                <input
                  type="text"
                  value={why4}
                  onChange={(e) => setWhy4(e.target.value)}
                  placeholder="Fourth level cause..."
                  className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-mono text-slate-500 uppercase">5. Why? (Identified Root Cause)</span>
                <input
                  type="text"
                  value={why5}
                  onChange={(e) => setWhy5(e.target.value)}
                  placeholder="Fifth level root cause..."
                  className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">Root Cause Category</span>
                <Select
                  value={rootCauseCategory}
                  onChange={(v) => setRootCauseCategory(v)}
                  className="w-full"
                >
                  <option value="MECHANICAL">Mechanical Failure</option>
                  <option value="ELECTRICAL">Electrical Failure</option>
                  <option value="HUMAN">Human / Operational Error</option>
                  <option value="PROCEDURAL">Procedural Gap</option>
                  <option value="ENVIRONMENTAL">Environmental Conditions</option>
                  <option value="DESIGN">Design Flaw</option>
                </Select>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-500 uppercase">Verified Root Cause Statement</span>
                <input
                  type="text"
                  value={verifiedRootCause}
                  onChange={(e) => setVerifiedRootCause(e.target.value)}
                  placeholder="Detailed summary statement of root cause..."
                  className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleSaveRca}
              disabled={saving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
            >
              Save RCA Analysis
            </button>
          </div>
        </div>

        {/* Right Side: Corrective Actions & Signoff */}
        <div className="space-y-6">
          {/* Corrective Actions Tracking Log (CATL) */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Corrective Action Log</h2>

            {/* Existing actions list */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto">
              {actions.map((act, i) => (
                <div key={i} className="p-3 bg-slate-100 rounded-lg border border-slate-200 text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-slate-900">{act.action}</span>
                    <button type="button" onClick={() => removeAction(i)} className="text-rose-600 hover:text-rose-700">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-500">
                    <span>By: {act.responsible}</span>
                    <span>Due: {act.date}</span>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => toggleActionStatus(i)}
                      className={`px-1.5 py-0.5 rounded text-[8px] font-bold border ${
                        act.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-slate-200 text-slate-500 border-slate-200"
                      }`}
                    >
                      {act.status}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add action row */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <input
                type="text"
                placeholder="Corrective Action Description..."
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Responsible Person..."
                  value={newResp}
                  onChange={(e) => setNewResp(e.target.value)}
                  className="bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none text-slate-500"
                />
              </div>
              <button
                type="button"
                onClick={addAction}
                className="w-full flex items-center justify-center gap-1 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 transition-all"
              >
                <Plus className="w-4 h-4" /> Add Action Item
              </button>
            </div>
          </div>

          {/* Closeout & Approvals */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Completion Sign-off</h2>

            {record.status === "CLOSED" ? (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs rounded-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Record Closed Out Successfully</p>
                  <p className="text-[10px] text-slate-500">Approved by Supervisor {record.supervisorName} on {record.closeOutDate}</p>
                  {record.totalDowntimeHours != null && (
                    <p className="text-[10px] text-slate-500">
                      Production downtime: <span className="font-mono font-semibold text-slate-700">{Number(record.totalDowntimeHours).toFixed(2)} h</span>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {currentUserName && (
                  <p className="text-[11px] text-slate-500">
                    Closing out as <span className="font-semibold text-slate-700">{currentUserName}</span> (recorded as the technician).
                  </p>
                )}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Approving Supervisor</span>
                  <input
                    type="text"
                    placeholder="Name of the supervisor approving this close-out"
                    value={supervisorName}
                    onChange={(e) => setSupervisorName(e.target.value)}
                    className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Supervisor Comments</span>
                  <textarea
                    placeholder="Provide supervisor closeout recommendations or audit check notes..."
                    value={supervisorComments}
                    onChange={(e) => setSupervisorComments(e.target.value)}
                    className="w-full h-16 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none resize-none"
                  />
                </div>

                {/* Downtime window — feeds MTTR. Production hours only. */}
                <div className="p-3 rounded-lg border border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-rose-600" />
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Downtime Window</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase">Machine went down</label>
                      <input
                        type="datetime-local"
                        value={downStartAt}
                        onChange={(e) => setDownStartAt(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase">Restored to service</label>
                      <input
                        type="datetime-local"
                        value={downEndAt}
                        onChange={(e) => setDownEndAt(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                      />
                    </div>
                  </div>
                  {previewDowntime !== null && (
                    <p className="text-xs text-slate-600">
                      Production downtime:{" "}
                      <span className="font-bold text-slate-900 font-mono">{previewDowntime.toFixed(2)} h</span>{" "}
                      <span className="text-[11px] text-slate-400">(excludes off-shift &amp; non-working days)</span>
                    </p>
                  )}
                </div>

                {/* Hand drawn Signatures */}
                <SignaturePad label="Technician Signature (Drawn)" onSave={setTechSign} />
                <SignaturePad label="Supervisor Approval Signature (Drawn)" onSave={setSuperSign} />

                <button
                  type="button"
                  onClick={handleCloseOut}
                  disabled={saving}
                  className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-rose-950/20"
                >
                  Verify and Close Breakdown Work Order
                </button>
              </div>
            )}
          </div>

          {/* Multi-level corrective sign-off chain */}
          <div className="lg:col-span-3">
            <SignoffChain
              entityType="CORRECTIVE"
              entityId={recordId}
              title="Corrective Maintenance Sign-off (Technician → Foreman → HSE → Maint. Manager → Factory Manager)"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
