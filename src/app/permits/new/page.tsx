// src/app/permits/new/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, Loader2 } from "lucide-react";

export default function NewPermit() {
  const router = useRouter();
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loadingEq, setLoadingEq] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states
  const [equipmentId, setEquipmentId] = useState("");
  const [workDescription, setWorkDescription] = useState("");
  const [hazardsIdentified, setHazardsIdentified] = useState("");
  const [controlMeasures, setControlMeasures] = useState("");
  const [lotoApplied, setLotoApplied] = useState(false);
  const [areaBarricaded, setAreaBarricaded] = useState(false);
  const [issuedToName, setIssuedToName] = useState("Maintenance Team");

  // PPE checklist
  const [ppeChecked, setPpeChecked] = useState<Record<string, boolean>>({
    safetyShoes: true,
    helmet: true,
    safetyGlasses: true,
    earProtection: false,
    gloves: true,
    harness: false,
  });

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

  const handlePpeChange = (key: string) => {
    setPpeChecked({ ...ppeChecked, [key]: !ppeChecked[key] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipmentId) return;

    setSaving(true);
    const ppeArray = Object.entries(ppeChecked)
      .filter(([_, checked]) => checked)
      .map(([key]) => key);

    try {
      const res = await fetch("/api/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId,
          workDescription,
          hazardsIdentified,
          controlMeasures,
          lotoApplied,
          areaBarricaded,
          issuedToName,
          ppeRequired: ppeArray,
        }),
      });

      if (res.ok) {
        // Redirect back to home dashboard or permits page
        router.push("/");
      }
    } catch (err) {
      console.error("Failed to raise PTW:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <ShieldCheck className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Raise Permit-to-Work</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">PTW Generator</p>
          </div>
        </div>
      </header>

      {/* Form Content */}
      <main className="flex-1 p-6 max-w-2xl w-full mx-auto">
        <form onSubmit={handleSubmit} className="p-6 bg-white border border-slate-200 rounded-xl space-y-6">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3 uppercase tracking-wide">
            Permit-to-Work Safe Isolation Request
          </h2>

          {/* Machine Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Select Target Machinery</label>
            {loadingEq ? (
              <div className="flex items-center text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600 mr-2" /> Loading equipment list...
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

          {/* Work Description */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Detailed Work Scope Description</label>
            <textarea
              required
              placeholder="Describe what parts will be isolated, what technical procedures will be performed..."
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              className="w-full h-24 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none resize-none"
            />
          </div>

          {/* Hazards & Control */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Identified Hazards</label>
              <textarea
                placeholder="e.g. Electrical shocks, high voltage terminal exposure, heavy components falls..."
                value={hazardsIdentified}
                onChange={(e) => setHazardsIdentified(e.target.value)}
                className="w-full h-20 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Hazard Control Measures</label>
              <textarea
                placeholder="e.g. Double barrier block isolations, current test verification, safety harnesses..."
                value={controlMeasures}
                onChange={(e) => setControlMeasures(e.target.value)}
                className="w-full h-20 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* PPE Checklist */}
          <div className="space-y-2.5">
            <label className="text-xs font-semibold text-slate-500 uppercase block">Required Personal Protective Equipment (PPE)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-slate-100 rounded border border-slate-200">
              {Object.entries(ppeChecked).map(([key, checked]) => (
                <label key={key} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handlePpeChange(key)}
                    className="rounded border-slate-200 bg-slate-100 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                  />
                  <span className="capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Safety Confirmations checkboxes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={lotoApplied}
                onChange={() => setLotoApplied(!lotoApplied)}
                className="rounded border-slate-200 bg-slate-100 text-emerald-500 focus:ring-0 w-4 h-4"
              />
              <div className="text-xs">
                <p className="font-bold text-slate-900">Isolation & LOTO Applied</p>
                <p className="text-[10px] text-slate-500">Lock-out Tag-out locks and isolation labels are securely placed</p>
              </div>
            </label>

            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={areaBarricaded}
                onChange={() => setAreaBarricaded(!areaBarricaded)}
                className="rounded border-slate-200 bg-slate-100 text-emerald-500 focus:ring-0 w-4 h-4"
              />
              <div className="text-xs">
                <p className="font-bold text-slate-900">Area Safety Barricaded</p>
                <p className="text-[10px] text-slate-500">Safety warning signs placed and physical boundaries are established</p>
              </div>
            </label>
          </div>

          {/* Issued To */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Work Party Lead Name</label>
            <input
              type="text"
              value={issuedToName}
              onChange={(e) => setIssuedToName(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-3">
            <Link
              href="/"
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold transition-all"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-md shadow-emerald-950/20"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Issue Permit-to-Work
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
