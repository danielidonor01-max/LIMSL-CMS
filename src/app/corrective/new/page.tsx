// src/app/corrective/new/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle, Loader2 } from "lucide-react";

export default function NewCorrectiveRequest() {
  const router = useRouter();
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loadingEq, setLoadingEq] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [equipmentId, setEquipmentId] = useState("");
  const [faultType, setFaultType] = useState("UNKNOWN");
  const [urgency, setUrgency] = useState("MEDIUM");
  const [faultDescription, setFaultDescription] = useState("");
  const [operatingStatusAtFailure, setOperatingStatusAtFailure] = useState("RUNNING");
  const [observedFault, setObservedFault] = useState("");
  const [errorCodes, setErrorCodes] = useState("");
  const [environmentalCondition, setEnvironmentalCondition] = useState("");

  useEffect(() => {
    async function loadEquipment() {
      try {
        const res = await fetch("/api/equipment");
        if (res.ok) {
          const data = await res.json();
          setEquipmentList(data);
          if (data.length > 0) setEquipmentId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to load machinery list:", err);
      } finally {
        setLoadingEq(false);
      }
    }
    loadEquipment();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentId) return;

    setSaving(true);
    try {
      const res = await fetch("/api/corrective", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId,
          faultType,
          urgency,
          faultDescription,
          operatingStatusAtFailure,
          observedFault,
          errorCodes,
          environmentalCondition,
        }),
      });

      if (res.ok) {
        router.push("/corrective");
      }
    } catch (err) {
      console.error("Failed to log fault:", err);
    } finally {
      setSaving(false);
    }
  };

  const faultTypes = [
    { value: "ELECTRICAL", label: "Electrical" },
    { value: "MECHANICAL", label: "Mechanical" },
    { value: "HYDRAULIC", label: "Hydraulic" },
    { value: "PNEUMATIC", label: "Pneumatic" },
    { value: "CONTROL", label: "Control / PLC" },
    { value: "STRUCTURAL", label: "Structural" },
    { value: "SAFETY", label: "Safety Device" },
    { value: "UNKNOWN", label: "Unknown / Intermittent" },
  ];

  const urgencies = [
    { value: "CRITICAL", label: "Critical (Stops production)" },
    { value: "HIGH", label: "High (Major impact)" },
    { value: "MEDIUM", label: "Medium" },
    { value: "LOW", label: "Low" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}


      {/* Form Content */}
      <main className="flex-1 p-6 max-w-2xl w-full mx-auto">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
          <Link href="/corrective" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Log Fault (CMRF)</h1>
            <p className="text-[10px] text-rose-600 font-mono tracking-wider uppercase">LIMSL-MAIN-015</p>
          </div>
        </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 bg-white border border-slate-200 rounded-xl space-y-6">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3 uppercase tracking-wide">
            Corrective Maintenance Request Form
          </h2>

          {/* Machine Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Select Broken Equipment</label>
            {loadingEq ? (
              <div className="flex items-center text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-rose-600 mr-2" /> Loading equipment list...
              </div>
            ) : (
              <select
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none"
                required
              >
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.assetId} - {eq.name} ({eq.location})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Fault Nature */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Nature of Fault</label>
              <select
                value={faultType}
                onChange={(e) => setFaultType(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none"
              >
                {faultTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Urgency */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Urgency Level</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none"
              >
                {urgencies.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fault Description */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Fault Description / Observed Symptom</label>
            <textarea
              placeholder="Describe the noise, vibration, failed startup sequence, burnt smell, or error codes observed..."
              value={faultDescription}
              onChange={(e) => setFaultDescription(e.target.value)}
              className="w-full h-24 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none resize-none"
              required
            />
          </div>

          {/* Additional details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Operating Status at Failure</label>
              <select
                value={operatingStatusAtFailure}
                onChange={(e) => setOperatingStatusAtFailure(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none"
              >
                <option value="RUNNING">Running</option>
                <option value="IDLE">Idle</option>
                <option value="STARTUP">Startup Sequence</option>
                <option value="SHUTDOWN">Shutdown Sequence</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Error Codes (if any)</label>
              <input
                type="text"
                placeholder="e.g. E-041, Spindle Overload"
                value={errorCodes}
                onChange={(e) => setErrorCodes(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Environmental / Load Conditions</label>
            <input
              type="text"
              placeholder="e.g. 35°C Room Temp, 80% Max Machine Load"
              value={environmentalCondition}
              onChange={(e) => setEnvironmentalCondition(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none"
            />
          </div>

          {/* Form Actions */}
          <div className="flex gap-3 justify-end pt-3">
            <Link
              href="/corrective"
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition-all"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-md shadow-rose-950/20"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Submit Request
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
