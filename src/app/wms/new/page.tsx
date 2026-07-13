// src/app/wms/new/page.tsx
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Loader2, Plus, Trash2 } from "lucide-react";

export default function NewWms() {
  const router = useRouter();
  const [equipmentList, setEquipmentList] = useState<any[]>([]);
  const [loadingEq, setLoadingEq] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form inputs
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState("");
  const [scope, setScope] = useState("");
  const [mobilization, setMobilization] = useState("");
  const [rawTools, setRawTools] = useState("");
  const [rawMaterials, setRawMaterials] = useState("");
  const [hseRequirements, setHseRequirements] = useState("");
  const [qualityControlRequirements, setQualityControlRequirements] = useState("");
  const [emergencyRequirements, setEmergencyRequirements] = useState("");
  const [selectedEquipments, setSelectedEquipments] = useState<string[]>([]);

  // Procedure Steps
  const [steps, setSteps] = useState<string[]>([""]);

  useEffect(() => {
    async function loadEquipment() {
      try {
        const res = await fetch("/api/equipment");
        if (res.ok) {
          const data = await res.json();
          setEquipmentList(data);
        }
      } catch (err) {
        console.error("Failed to load machinery:", err);
      } finally {
        setLoadingEq(false);
      }
    }
    loadEquipment();
  }, []);

  const addStepField = () => {
    setSteps([...steps, ""]);
  };

  const removeStepField = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStepValue = (index: number, val: string) => {
    setSteps(steps.map((s, i) => (i === index ? val : s)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const parsedTools = rawTools.split(",").map((s) => s.trim()).filter(Boolean);
    const parsedMaterials = rawMaterials.split(",").map((s) => s.trim()).filter(Boolean);
    const parsedSteps = steps.map((s) => s.trim()).filter(Boolean);

    // Determine machinery scope names based on selected IDs
    const scopeNames = selectedEquipments.map((id) => {
      const match = equipmentList.find((eq) => eq.id === id);
      return match ? match.name : "";
    }).filter(Boolean);

    try {
      const res = await fetch("/api/wms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          purpose,
          scope,
          mobilization,
          equipmentAndTools: parsedTools,
          materials: parsedMaterials,
          workProcedureSteps: parsedSteps,
          hseRequirements,
          qualityControlRequirements: qualityControlRequirements,
          emergencyRequirements: emergencyRequirements,
          equipmentIds: selectedEquipments,
          machinesScope: scopeNames,
          preparedByName: "Daniel Idonor",
        }),
      });

      if (res.ok) {
        router.push("/wms");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const toggleEquipmentSelect = (id: string) => {
    setSelectedEquipments(
      selectedEquipments.includes(id)
        ? selectedEquipments.filter((x) => x !== id)
        : [...selectedEquipments, id]
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}


      {/* Main Content */}
      <main className="flex-1 p-6 max-w-3xl w-full mx-auto">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
          <Link href="/wms" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <FileText className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">Draft WMS</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">Method Statement Creator</p>
          </div>
        </div>
        </div>
        <form onSubmit={handleSubmit} className="p-6 bg-white border border-slate-200 rounded-xl space-y-6">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3 uppercase tracking-wide">
            Create Work Method Statement (WMS)
          </h2>

          {/* Document Title */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Document Title</label>
            <input
              type="text"
              required
              placeholder="e.g. Work Method Statement for Spindle Bearing Replacement on JOBS Boring Machine"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none"
            />
          </div>

          {/* Machine Scope Checkboxes */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase block">Associated Machinery Scope</label>
            {loadingEq ? (
              <p className="text-xs text-slate-500">Loading equipment...</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 max-h-36 overflow-y-auto p-2 bg-white rounded border border-slate-200">
                {equipmentList.map((eq) => (
                  <label key={eq.id} className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={selectedEquipments.includes(eq.id)}
                      onChange={() => toggleEquipmentSelect(eq.id)}
                      className="rounded border-slate-200 bg-slate-100 text-emerald-500 focus:ring-0 w-3.5 h-3.5"
                    />
                    <span>{eq.assetId}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Scope / Purpose */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Purpose of operation</label>
              <textarea
                required
                placeholder="Describe the main objectives of this technical operation..."
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full h-20 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Scope of work</label>
              <textarea
                required
                placeholder="Outline boundaries, targeted machinery subcomponents..."
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="w-full h-20 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Tools & Materials list */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Equipment & Tools Needed</label>
              <input
                type="text"
                placeholder="Tool A, Tool B, Tool C (comma separated)..."
                value={rawTools}
                onChange={(e) => setRawTools(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Materials & Spares Needed</label>
              <input
                type="text"
                placeholder="Material X, Spare Part Y (comma separated)..."
                value={rawMaterials}
                onChange={(e) => setRawMaterials(e.target.value)}
                className="w-full bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none"
              />
            </div>
          </div>

          {/* Procedure Steps Inputs */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-500 uppercase">Detailed Work Procedure Steps</label>
              <button
                type="button"
                onClick={addStepField}
                className="text-[11px] text-emerald-600 hover:text-emerald-350 flex items-center gap-1 transition-all"
              >
                + Add Step
              </button>
            </div>

            <div className="space-y-2.5">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-2.5 items-center">
                  <span className="w-6 h-6 rounded bg-slate-100 border border-slate-200 text-slate-500 font-mono font-bold text-xs flex items-center justify-center">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <input
                    type="text"
                    required
                    placeholder={`Step ${String.fromCharCode(65 + i)} procedure details...`}
                    value={step}
                    onChange={(e) => updateStepValue(i, e.target.value)}
                    className="flex-1 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2 text-xs focus:outline-none"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStepField(i)}
                      className="p-2 text-rose-500 hover:bg-slate-100 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* HSE Requirements */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">HSE & Safe Work Requirements</label>
            <textarea
              required
              placeholder="Detail LOTO isolation points, safety barriers, gas tests, PPE levels..."
              value={hseRequirements}
              onChange={(e) => setHseRequirements(e.target.value)}
              className="w-full h-16 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
            />
          </div>

          {/* QAQC & Emergency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Quality Control & Tolerance Inspections</label>
              <textarea
                placeholder="Visual inspections, torque settings, dial test alignment check values..."
                value={qualityControlRequirements}
                onChange={(e) => setQualityControlRequirements(e.target.value)}
                className="w-full h-16 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-500 uppercase">Emergency & Spillage Response Plan</label>
              <textarea
                placeholder="Steps if oil spill, electrical fire, emergency stop activation occurs..."
                value={emergencyRequirements}
                onChange={(e) => setEmergencyRequirements(e.target.value)}
                className="w-full h-16 bg-slate-100 border border-slate-200 focus:border-slate-300 rounded-lg p-2.5 text-xs focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-3">
            <Link
              href="/wms"
              className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold transition-all"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shadow-md shadow-emerald-950/20"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Save Draft WMS
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
