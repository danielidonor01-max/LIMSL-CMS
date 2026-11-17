// src/app/corrective/[id]/page.tsx
"use client";

import Button from "@/components/Button";
import { pageMain } from "@/lib/page-shell";
import DateTimeField from "@/components/DateTimeField";
import DateField from "@/components/DateField";
import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Clock, ShieldCheck, Plus, UserCheck, CheckCircle2, CircleDashed, Save } from "lucide-react";
import { DeleteButton } from "@/components/DeleteButton";
import SignoffChain from "@/components/SignoffChain";
import CorrectiveFlow from "@/components/CorrectiveFlow";
import WorkReadiness from "@/components/WorkReadiness";
import WorkOrderParts from "@/components/WorkOrderParts";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import Select from "@/components/Select";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { useDraft } from "@/lib/use-draft";
import { failureModesFor, DETECTION_METHODS } from "@/lib/maintenance/failure-codes";
import { productionDowntimeHours, type WorkSettings, DEFAULT_WORK_SETTINGS } from "@/lib/worktime";
import PageSkeleton from "@/components/Skeleton";
import { closeOutGaps } from "@/lib/maintenance/cm-closeout-rules";

export default function CorrectiveDetail({ params }: { params: Promise<{ id: string }> }) {
  const { data: session } = useSession();
  const currentUserRole = (session?.user as { role?: string })?.role ?? null;
  const resolvedParams = use(params);
  const recordId = resolvedParams.id;

  const [record, setRecord] = useState<any>(null);
  // Bumped when the repair flow takes an action, so the record below it
  // reflects the authorisation or assignment that just happened.
  const [reloadKey, setReloadKey] = useState(0);

  // The session resolves client-side only, so anything role-dependent waits
  // past mount or the server HTML and the first paint disagree (AGENTS.md 7).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const canBookParts = mounted && MAINTENANCE_WRITE_ROLES.includes(currentUserRole ?? "");
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
  const [failureMode, setFailureMode] = useState("");
  const [detectionMethod, setDetectionMethod] = useState("");
  const [verifiedRootCause, setVerifiedRootCause] = useState("");

  // Corrective Actions (CATL)
  const [actions, setActions] = useState<any[]>([]);
  const [newAction, setNewAction] = useState("");
  const [newResp, setNewResp] = useState("");
  const [newDate, setNewDate] = useState("");

  const [supervisorComments, setSupervisorComments] = useState("");

  // Downtime window, production hours are derived from these against the
  // working-hours settings, so a weekend or off-shift outage isn't over-counted.
  const [assignedToId, setAssignedToId] = useState("");
  const [rcaTargetDate, setRcaTargetDate] = useState("");
  const [expectedRestorationAt, setExpectedRestorationAt] = useState("");
  const [userList, setUserList] = useState<any[]>([]);
  const [downStartAt, setDownStartAt] = useState("");
  const [downEndAt, setDownEndAt] = useState("");
  const [workSettings, setWorkSettings] = useState<WorkSettings>(DEFAULT_WORK_SETTINGS);
  // What was last saved, so the page can say whether anything is unsaved.
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  // The sign-off chain, read here too so the close-out checklist can count it.
  const [chain, setChain] = useState<{ required: boolean | null; status: string }[]>([]);
  const loadChain = useCallback(() => {
    fetch(`/api/signoffs?entityType=CORRECTIVE&entityId=${recordId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setChain(Array.isArray(d) ? d : []))
      .catch(() => setChain([]));
  }, [recordId]);
  useEffect(() => loadChain(), [loadChain, reloadKey]);

  // The roster for the investigator picker. A free-text name here would be the
  // same mistake the close-out just stopped making.
  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setUserList(Array.isArray(d) ? d : []))
      .catch(() => setUserList([]));
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/corrective/${recordId}`);
        if (res.ok) {
          const data = await res.json();
          setRecord(data);

          // Seed the downtime window. Default the "down" moment to the reported
          // day at the start of shift so the technician only adjusts if needed.
          setAssignedToId(data.assignedToId || "");
          setRcaTargetDate(data.rcaTargetDate || "");
          setExpectedRestorationAt(data.expectedRestorationAt || "");
          setDownStartAt(data.downStartAt || (data.reportedDate ? `${data.reportedDate}T08:00` : ""));
          setDownEndAt(data.downEndAt || "");
          setSupervisorComments(data.supervisorComments || "");

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
          if (data.failureMode) setFailureMode(data.failureMode);
          if (data.detectionMethod) setDetectionMethod(data.detectionMethod);
          if (data.verifiedRootCause) setVerifiedRootCause(data.verifiedRootCause);

          // Load Actions
          if (data.correctiveActions) {
            setActions(JSON.parse(data.correctiveActions));
          }
          setLoadedAt(Date.now());

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
  }, [recordId, reloadKey]);

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

  const whySteps = [
    { key: "why-1", value: why1, set: setWhy1 },
    { key: "why-2", value: why2, set: setWhy2 },
    { key: "why-3", value: why3, set: setWhy3 },
    { key: "why-4", value: why4, set: setWhy4 },
    { key: "why-5", value: why5, set: setWhy5 },
  ];

  // The 5 Whys plus an action list is a long sit-down on a phone or a laptop in
  // the workshop; keep a local draft so a dropped connection or a closed tab
  // doesn't cost the whole investigation.
  const { draft, clearDraft, dismissDraft } = useDraft(
    recordId ? `rca:${recordId}` : null,
    { why1, why2, why3, why4, why5, rootCauseCategory, failureMode, detectionMethod, verifiedRootCause, actions },
  );
  const restoreDraft = () => {
    if (!draft) return;
    setWhy1(draft.why1);
    setWhy2(draft.why2);
    setWhy3(draft.why3);
    setWhy4(draft.why4);
    setWhy5(draft.why5);
    setRootCauseCategory(draft.rootCauseCategory);
    setFailureMode(draft.failureMode);
    setDetectionMethod(draft.detectionMethod);
    setVerifiedRootCause(draft.verifiedRootCause);
    setActions(draft.actions);
    dismissDraft();
    toast.success("Your unsaved analysis was restored.");
  };

  // The RCA fields as the API expects them. Close-out sends these TOO, a
  // technician who fills the 5 Whys and closes out without first pressing
  // "Save RCA Analysis" used to lose the entire analysis silently.
  const rcaPayload = () => ({
    rcaTool,
    rcaAnalysis: { why1, why2, why3, why4, why5 },
    rootCauseCategory,
    failureMode,
    detectionMethod,
    verifiedRootCause,
    correctiveActions: actions,
  });

  // ONE save for the whole record (LIMSL, 17 Nov 2026). The analysis, the
  // dates, the downtime window, the notes and the action log used to have a
  // button each, and the close button asked for signatures the page no longer
  // collected. Now the record is filled in and saved, the chain below is
  // signed, and the last signature closes it (lib/maintenance/cm-closeout.ts).
  const formPayload = () => ({
    ...rcaPayload(),
    rcaTargetDate,
    expectedRestorationAt,
    downStartAt,
    downEndAt,
    supervisorComments,
  });
  const formKey = JSON.stringify(formPayload());
  const dirty = savedKey !== null && formKey !== savedKey;
  // Snapshot the form right after a load, once the fields hold the record.
  useEffect(() => {
    if (loadedAt) setSavedKey(formKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedAt]);

  const handleSave = async () => {
    if (downStartAt && downEndAt && new Date(downEndAt).getTime() <= new Date(downStartAt).getTime()) {
      toast.error("The restored time must be after the machine went down.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/corrective/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formPayload()),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Couldn't save, your entries are still here. Try again.");
        return;
      }
      const saved = await res.json().catch(() => null);
      if (saved && saved.id) setRecord(saved);
      setSavedKey(formKey);
      clearDraft();
      toast.success("Breakdown record saved.");
    } catch {
      toast.error("Couldn't save, your entries are still here. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const savedGaps = record ? closeOutGaps(record) : [];
  const requiredSteps = chain.filter((s) => s.required !== false);
  const signedSteps = requiredSteps.filter((s) => s.status === "SIGNED").length;
  const isClosed = record?.status === "CLOSED";
  const readiness = [
    { label: "Work order raised", done: !!record?.workOrderId },
    { label: "Failure mode chosen and saved", done: !savedGaps.includes("the failure mode") },
    { label: "Verified root cause written and saved", done: !savedGaps.includes("the verified root cause") },
    {
      label: "Downtime window saved (down and restored)",
      done: !savedGaps.some((g) => g.startsWith("when the machine") || g.startsWith("a restored time")),
    },
    {
      label: requiredSteps.length ? `Signatures: ${signedSteps} of ${requiredSteps.length}` : "Signatures",
      done: requiredSteps.length > 0 && signedSteps === requiredSteps.length,
    },
  ];

  if (loading) {
    return (
      <PageSkeleton variant="detail" label="Loading corrective record" />
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-3 text-ink-500 text-sm">
        <p>Corrective record not found.</p>
        <Link href="/corrective" className="text-danger-600 hover:underline">Back to corrective register</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={pageMain("detail", "grid grid-cols-1 lg:grid-cols-3 gap-6")}>
        <div className="lg:col-span-3">
          <PageHeader


            title="Breakdown Record"
            subtitle="Fault report, root-cause analysis and close-out"
            code={record.cmrfNumber}
            backHref="/corrective"
            backLabel="Corrective Maintenance"
          />
        </div>

        {/* What has to happen next, and who does it. A breakdown record that
            does not say this is a form, not a process. */}
        <div className="lg:col-span-3">
          <CorrectiveFlow
            recordId={recordId}
            role={currentUserRole}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        </div>

        {/* Once the work order exists: whether the repair may start today.
            Work order, method statement, hazard analysis and permit all
            signed, and — after the first day — today's revalidation. */}
        {record.workOrderId && record.status !== "CLOSED" && (
          <div className="lg:col-span-3">
            <WorkReadiness workOrderId={record.workOrderId} />
          </div>
        )}

        {/* Left Side: Fault Spec & RCA */}
        <div className="lg:col-span-2 space-y-8">
          {/* Fault Specifications Card */}
          <div className="p-5 bg-surface border border-line rounded-xl shadow-card space-y-4">
            <h2 className="text-base font-semibold text-ink-900">Breakdown Specifications</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-xs text-ink-500 block mb-1">Equipment Name</span>
                {equipment?.assetId ? (
                  <Link
                    href={`/equipment/${equipment.assetId.replace(/\//g, "-")}`}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {equipment.name}
                  </Link>
                ) : (
                  <span className="font-semibold text-ink-900">{equipment?.name || "Loading..."}</span>
                )}
              </div>
              <div>
                <span className="text-xs text-ink-500 block mb-1">Location</span>
                <span className="font-semibold text-ink-900">{equipment?.location || "-"}</span>
              </div>
              <div>
                <span className="text-xs text-ink-500 block mb-1">Status at failure</span>
                <span className="font-semibold text-ink-900">{record.operatingStatusAtFailure}</span>
              </div>
            </div>

            <div className="text-xs space-y-1">
              <span className="text-xs text-ink-500 block">Reported Fault Description</span>
              <p className="bg-ink-100 p-3 rounded-lg border border-ink-200 text-ink-700 leading-relaxed">
                {record.faultDescription}
              </p>
            </div>
          </div>

          {/* Offer back an unfinished investigation rather than losing it. */}
          {draft && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn-200 bg-warn-50 px-4 py-3">
              <p className="text-xs text-warn-900 flex-1 min-w-[12rem]">
                You have an unsaved root-cause analysis for this breakdown on this device.
              </p>
              <button
                onClick={restoreDraft}
                className="min-h-11 px-4 rounded-lg bg-warn-600 hover:bg-warn-500 text-white text-xs font-semibold"
              >
                Restore it
              </button>
              <button onClick={dismissDraft} className="min-h-11 px-3 text-xs font-semibold text-warn-800 hover:text-warn-950">
                Discard
              </button>
            </div>
          )}

          {/* Root Cause Analysis (RCA) Card */}
          <div className="p-5 bg-surface border border-line rounded-xl shadow-card space-y-5">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-semibold text-ink-900">Root Cause Analysis (RCA)</h2>
              <span className="px-2 py-0.5 rounded-lg bg-ink-100 border border-ink-200 text-xs font-semibold text-ink-500">
                {rcaTool === "FIVE_WHYS" ? "5 Whys" : rcaTool.replace(/_/g, " ")}
              </span>
            </div>

            {/* The 5 Whys is a chain, and it was rendered as five identical
                disconnected boxes, which is why they get filled in as five
                unrelated statements. Each step now names the answer above it, so
                the question you are actually answering is the one the technique
                asks. */}
            <ol className="space-y-0">
              {whySteps.map((step, i) => {
                const previous = i === 0 ? null : whySteps[i - 1].value.trim();
                const isRoot = i === whySteps.length - 1;
                const answered = step.value.trim().length > 0;
                return (
                  <li key={step.key} className="flex gap-3">
                    {/* Rail: the numbered node and the line that connects it on */}
                    <div className="flex flex-col items-center shrink-0">
                      <span
                        className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold border-2 transition-colors ${
 isRoot && answered
 ? "bg-danger-600 border-danger-600 text-white"
 : answered
 ? "bg-brand-600 border-brand-600 text-white"
 : "bg-white border-ink-300 text-ink-400"
 }`}
                      >
                        {i + 1}
                      </span>
                      {!isRoot && (
                        <span
                          className={`w-0.5 flex-1 min-h-8 ${answered ? "bg-brand-300" : "bg-ink-200"}`}
                          aria-hidden
                        />
                      )}
                    </div>

                    <div className={`flex-1 ${isRoot ? "pb-1" : "pb-5"}`}>
                      <label htmlFor={step.key} className="block text-xs font-semibold text-ink-700">
                        {i === 0
                          ? "Why did it fail?"
                          : previous
                            ? `Why did that happen, "${previous.length > 60 ? `${previous.slice(0, 60)}…` : previous}"?`
                            : "Why did that happen?"}
                        {isRoot && (
                          <span className="ml-2 text-xs font-bold text-danger-700">
                            Root cause
                          </span>
                        )}
                      </label>
                      <input
                        id={step.key}
                        type="text"
                        value={step.value}
                        onChange={(e) => step.set(e.target.value)}
                        disabled={i > 0 && !previous}
                        placeholder={
                          i > 0 && !previous
                            ? "Answer the step above first"
                            : isRoot
                              ? "The cause that, if fixed, stops this recurring"
                              : "Because…"
                        }
                        className="mt-1.5 w-full bg-ink-50 border border-ink-200 rounded-lg px-3 min-h-11 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:bg-ink-100 disabled:text-ink-400 disabled:cursor-not-allowed"
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            <p className="text-xs text-ink-500 -mt-1">
              Stop early if you reach a cause you can actually act on, five levels is a guide, not a quota.
              A root cause you cannot change is a sign the chain went one step too far.
            </p>

            {/* Coded failure taxonomy. Free-text root cause describes ONE
                event; codes let the same failure be counted across the fleet. */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink-500">Failure Mode</span>
                <Select value={failureMode} onChange={(v) => setFailureMode(v)} className="w-full" ariaLabel="Failure mode">
                  <option value="">Select the failure mode…</option>
                  {failureModesFor(record?.faultType).map((m) => (
                    <option key={m.code} value={m.code}>{m.label}</option>
                  ))}
                </Select>
                <p className="text-xs text-ink-400">Required at close-out, this is what makes recurring failures visible.</p>
              </div>
              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink-500">How was it detected?</span>
                <Select value={detectionMethod} onChange={(v) => setDetectionMethod(v)} className="w-full" ariaLabel="Detection method">
                  <option value="">Select…</option>
                  {DETECTION_METHODS.map((d) => (
                    <option key={d.code} value={d.code}>{d.label}</option>
                  ))}
                </Select>
                <p className="text-xs text-ink-400">Shows whether the PM programme is catching faults before they stop the machine.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-ink-500">Root Cause Category</span>
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
                <span className="text-xs font-semibold text-ink-500">Verified Root Cause Statement</span>
                <input
                  type="text"
                  value={verifiedRootCause}
                  onChange={(e) => setVerifiedRootCause(e.target.value)}
                  placeholder="Detailed summary statement of root cause..."
                  className="w-full bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2.5 text-xs focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Dates, downtime and notes. Saved with everything else by the one
              Save below; no button of their own. */}
          <div className="p-5 bg-surface border border-line rounded-xl shadow-card space-y-4">
            <h2 className="text-base font-semibold text-ink-900">
              {isClosed ? "Close-out" : "Dates and downtime"}
            </h2>

            {isClosed ? (
              <div className="p-3 bg-brand-500/10 border border-brand-500/20 text-brand-600 text-xs rounded-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                <div>
                  <p className="font-bold">Closed on {record.closeOutDate}</p>
                  <p className="text-xs text-ink-500">
                    Repaired by {record.technicianName ?? "-"}, verified by {record.supervisorName ?? "-"}
                  </p>
                  {record.totalDowntimeHours != null && (
                    <p className="text-xs text-ink-500">
                      Production downtime: <span className="font-semibold text-ink-700">{Number(record.totalDowntimeHours).toFixed(2)} h</span>
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Who is investigating, and when the machine is expected back. */}
                <div className="p-3 rounded-lg border border-ink-200 bg-ink-50 space-y-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-brand-600" />
                    <span className="text-xs font-semibold text-ink-700">Investigation &amp; restoration</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Shown, not chosen: the Foreman assigns in the repair flow above. */}
                    <div className="space-y-1.5">
                      <p className="text-sm font-medium text-ink-700">Assigned to</p>
                      <p className="text-sm text-ink-900 py-2">{record.assignedToName || "Nobody yet"}</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-ink-700">RCA due by</label>
                      <DateField value={rcaTargetDate} onChange={setRcaTargetDate} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <label className="text-sm font-medium text-ink-700">Expected back in service</label>
                      <DateTimeField
                        value={expectedRestorationAt}
                        onChange={setExpectedRestorationAt}
                        ariaLabel="Expected back in service"
                      />
                      <p className="text-xs text-ink-500">What production is told while the machine is down.</p>
                    </div>
                  </div>
                </div>

                {/* Downtime window, feeds MTTR. Production hours only. */}
                <div className="p-3 rounded-lg border border-ink-200 bg-ink-50 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-danger-600" />
                    <span className="text-xs font-semibold text-ink-700">Downtime window</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-ink-700">Machine went down</label>
                      <DateTimeField value={downStartAt} onChange={setDownStartAt} ariaLabel="Machine went down" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-ink-700">Restored to service</label>
                      <DateTimeField
                        value={downEndAt}
                        onChange={setDownEndAt}
                        min={downStartAt || undefined}
                        ariaLabel="Restored to service"
                      />
                    </div>
                  </div>
                  {previewDowntime !== null && (
                    <p className="text-xs text-ink-600">
                      Production downtime:{" "}
                      <span className="font-bold text-ink-900">{previewDowntime.toFixed(2)} h</span>{" "}
                      <span className="text-xs text-ink-400">(excludes off-shift &amp; non-working days)</span>
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="cm-notes" className="text-xs font-semibold text-ink-500">Notes for the sign-off</label>
                  <textarea
                    id="cm-notes"
                    placeholder="Anything the people signing should know: checks done, follow-ups, recommendations…"
                    value={supervisorComments}
                    onChange={(e) => setSupervisorComments(e.target.value)}
                    className="w-full h-16 bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2 text-xs focus:outline-none resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* The one save. It sticks to the bottom of the column, so it is
              never a scroll away while something is unsaved. */}
          {!isClosed && (
            <div
              className={`${dirty ? "sticky bottom-4 z-30 shadow-raised" : "shadow-card"} flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3`}
            >
              <p className={`text-sm ${dirty ? "text-warn-700 font-medium" : "text-ink-500"}`}>
                {dirty ? "You have unsaved changes." : "Everything on this record is saved."}
              </p>
              <Button icon={Save} onClick={handleSave} loading={saving} disabled={!dirty || saving}>
                Save
              </Button>
            </div>
          )}

          {/* What closing needs. Nothing to press here: the record closes
              itself when the last signature on the chain below lands. */}
          {!isClosed && (
            <div className="p-5 bg-surface border border-line rounded-xl shadow-card space-y-3">
              <h2 className="text-base font-semibold text-ink-900">How this record closes</h2>
              <p className="text-sm text-ink-600">
                Save the record, then three people sign once below: the technician, the
                foreman, then the Maintenance Manager, whose signature closes it. There is
                no separate close button.
              </p>
              <ul className="space-y-2">
                {readiness.map((r) => (
                  <li key={r.label} className="flex items-start gap-2.5 text-sm">
                    {r.done ? (
                      <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-brand-600" aria-hidden />
                    ) : (
                      <CircleDashed className="w-4 h-4 mt-0.5 shrink-0 text-ink-400" aria-hidden />
                    )}
                    <span className={r.done ? "text-ink-700" : "text-ink-900 font-medium"}>{r.label}</span>
                    <span className="sr-only">{r.done ? "done" : "to do"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </div>

        {/* Right Side: Corrective Actions & Signoff */}
        <div className="space-y-8">
          {/* Parts fitted during the repair. Booking them here is what takes
              them off the shelf, so the critical spares register reflects what
              the repair actually consumed rather than what somebody remembered
              to adjust afterwards. */}
          {record.workOrderId && (
            <WorkOrderParts
              workOrderId={record.workOrderId}
              equipmentId={record.equipmentId}
              canWrite={canBookParts}
            />
          )}

          {/* Corrective Actions Tracking Log (CATL) */}
          <div className="p-5 bg-surface border border-line rounded-xl shadow-card space-y-4">
            <h2 className="text-base font-semibold text-ink-900">Corrective Action Log</h2>
            <p className="text-xs text-ink-500">Items you add here are kept when you press Save.</p>

            {/* Existing actions list */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto">
              {actions.map((act, i) => (
                <div key={i} className="p-3 bg-ink-100 rounded-lg border border-ink-200 text-xs space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-ink-900">{act.action}</span>
                    <DeleteButton onConfirm={() => removeAction(i)} aria-label={`Remove "${act.action}"`} />
                  </div>
                  <div className="flex justify-between items-center text-xs text-ink-500">
                    <span>By: {act.responsible}</span>
                    <span>Due: {act.date}</span>
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => toggleActionStatus(i)}
                      className={`px-1.5 py-0.5 rounded-lg text-xs font-bold border ${
 act.status === "COMPLETED"
 ? "bg-brand-500/10 text-brand-600 border-brand-500/20"
 : "bg-ink-200 text-ink-500 border-ink-200"
 }`}
                    >
                      {act.status}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add action row */}
            <div className="space-y-2 pt-2 border-t border-ink-200">
              <input
                type="text"
                placeholder="Corrective Action Description..."
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                className="w-full bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2 text-xs focus:outline-none"
              />
              <div className="grid grid-cols-1 gap-2">
                <input
                  type="text"
                  placeholder="Responsible Person..."
                  value={newResp}
                  onChange={(e) => setNewResp(e.target.value)}
                  className="bg-ink-100 border border-ink-200 focus:border-ink-300 rounded-lg p-2 text-xs focus:outline-none"
                />
                <DateField value={newDate} onChange={(v) => setNewDate(v)} />
              </div>
              <button
                type="button"
                onClick={addAction}
                className="w-full flex items-center justify-center gap-1 py-2 bg-ink-100 hover:bg-ink-200 border border-ink-200 rounded-lg text-xs font-semibold text-ink-900 transition-all"
              >
                <Plus className="w-4 h-4" /> Add to the list
              </button>
            </div>
          </div>

        </div>

        {/* Multi-level corrective sign-off chain, the full width of the page */}
        <div className="lg:col-span-3">
          <SignoffChain
            entityType="CORRECTIVE"
            entityId={recordId}
            title="Corrective maintenance sign-off"
            onChange={() => setReloadKey((k) => k + 1)}
          />
        </div>
      </main>
    </div>
  );
}
