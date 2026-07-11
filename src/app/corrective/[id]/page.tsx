// src/app/corrective/[id]/page.tsx
"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
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

export default function CorrectiveDetail({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
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
  const [supervisorComments, setSupervisorComments] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch(`/api/corrective/${recordId}`);
        if (res.ok) {
          const data = await res.json();
          setRecord(data);
          
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
      } catch (err) {
        console.error("Error loading corrective details:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [recordId]);

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

  const handleSaveRca = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/corrective/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rcaTool,
          rcaAnalysis: { why1, why2, why3, why4, why5 },
          rootCauseCategory,
          verifiedRootCause,
          correctiveActions: actions,
        }),
      });
      if (res.ok) {
        alert("RCA and Corrective Actions saved successfully!");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleCloseOut = async () => {
    if (!techSign || !superSign) {
      alert("Both technician and supervisor signatures are required to close out the request.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/corrective/${recordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CLOSED",
          technicianSignature: techSign,
          technicianName: "Daniel Idonor",
          supervisorSignature: superSign,
          supervisorName: "Kingsley Iworah",
          supervisorComments,
          closeOutDate: new Date().toISOString().split("T")[0],
        }),
      });

      if (res.ok) {
        router.push("/corrective");
      }
    } catch (err) {
      console.error(err);
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/corrective" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center">
            <AlertTriangle className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Work Order: {record.cmrfNumber}</h1>
            <p className="text-[10px] text-rose-600 font-mono tracking-wider uppercase">Fault & RCA Lifecycle</p>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Side: Fault Spec & RCA */}
        <div className="lg:col-span-2 space-y-6">
          {/* Fault Specifications Card */}
          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Breakdown Specifications</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block mb-1">Equipment Name</span>
                <span className="font-semibold text-slate-900">{equipment?.name || "Loading..."}</span>
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
                <select
                  value={rootCauseCategory}
                  onChange={(e) => setRootCauseCategory(e.target.value)}
                  className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none"
                >
                  <option value="MECHANICAL">Mechanical Failure</option>
                  <option value="ELECTRICAL">Electrical Failure</option>
                  <option value="HUMAN">Human / Operational Error</option>
                  <option value="PROCEDURAL">Procedural Gap</option>
                  <option value="ENVIRONMENTAL">Environmental Conditions</option>
                  <option value="DESIGN">Design Flaw</option>
                </select>
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
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
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
                    <button type="button" onClick={() => removeAction(i)} className="text-rose-600 hover:text-rose-350">
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
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-500 uppercase">Supervisor Comments</span>
                  <textarea
                    placeholder="Provide supervisor closeout recommendations or audit check notes..."
                    value={supervisorComments}
                    onChange={(e) => setSupervisorComments(e.target.value)}
                    className="w-full h-16 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none resize-none"
                  />
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
