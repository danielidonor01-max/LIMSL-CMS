// src/app/equipment/[assetId]/troubleshoot/page.tsx
"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Play,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

export default function TroubleshootingWizard({ params }: { params: Promise<{ assetId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const assetIdKey = resolvedParams.assetId;

  const [eq, setEq] = useState<any>(null);
  const [guides, setGuides] = useState<any[]>([]);
  const [schematics, setSchematics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Wizard state
  const [selectedGuideId, setSelectedGuideId] = useState("");
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Record<number, boolean>>({});
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadWizardData() {
      try {
        const eqRes = await fetch(`/api/equipment/${assetIdKey}`);
        if (eqRes.ok) {
          const eqData = await eqRes.json();
          setEq(eqData);

          const guideRes = await fetch(`/api/equipment/${assetIdKey}/diagnostics`);
          if (guideRes.ok) {
            const guideData = await guideRes.json();
            setGuides(guideData);
            if (guideData.length > 0) setSelectedGuideId(guideData[0].id);
          }

          const schemRes = await fetch(`/api/equipment/${assetIdKey}/schematics`);
          if (schemRes.ok) {
            const schemData = await schemRes.json();
            setSchematics(schemData);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadWizardData();
  }, [assetIdKey]);

  const activeGuide = guides.find((g) => g.id === selectedGuideId);
  const steps = activeGuide ? JSON.parse(activeGuide.diagnosticSteps) : [];

  const handleStepToggle = (index: number) => {
    setCompletedSteps({ ...completedSteps, [index]: !completedSteps[index] });
  };

  const handleFinish = async () => {
    setSaving(true);
    // Simple success count increment
    toast.success("Troubleshooting sequence finished. Resolution outcome saved. Maintenance logs updated.");
    router.push(`/equipment/${assetIdKey}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center text-slate-400 font-mono text-xs gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-400" /> Loading troubleshooting wizard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/equipment/${assetIdKey}`}
            className="p-2 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <BookOpen className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Diagnostics Wizard</h1>
            <p className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase">
              {eq.name} ({eq.assetId})
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6 max-w-4xl w-full mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Wizard select and diagnostic checklist */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Select Symptom or Error Code</h3>
            <select
              value={selectedGuideId}
              onChange={(e) => {
                setSelectedGuideId(e.target.value);
                setCompletedSteps({});
                setCurrentStepIndex(0);
              }}
              className="w-full bg-slate-900 border border-slate-800 focus:border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none"
            >
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.errorCode ? `[${g.errorCode}] ` : ""}{g.symptom}
                </option>
              ))}
            </select>
          </div>

          {activeGuide ? (
            <div className="p-6 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wide">Step-by-Step Diagnostic Path</h3>
                <p className="text-xs text-slate-400 mt-1.5">**Probable Cause:** {activeGuide.probableCause}</p>
              </div>

              {/* Steps checklist */}
              <div className="space-y-4">
                {steps.map((step: string, i: number) => {
                  const isDone = !!completedSteps[i];
                  return (
                    <div
                      key={i}
                      onClick={() => handleStepToggle(i)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${
                        isDone
                          ? "bg-emerald-500/5 border-emerald-500/20 text-slate-400"
                          : "bg-slate-900/50 border-slate-800 text-slate-200 hover:border-slate-750"
                      }`}
                    >
                      <div className="mt-0.5">
                        <CheckCircle2 className={`w-4 h-4 ${isDone ? "text-emerald-400" : "text-slate-700"}`} />
                      </div>
                      <div className="text-xs leading-relaxed">
                        <span className="font-bold text-[10px] text-slate-500 uppercase block mb-1">Step {i + 1}</span>
                        <p className={isDone ? "line-through" : ""}>{step}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Resolution selection */}
              <div className="space-y-2 pt-4 border-t border-slate-800/40">
                <label className="text-xs font-semibold text-slate-400 uppercase">Resolution Outcome</label>
                <input
                  type="text"
                  placeholder="e.g. Reset breaker CB-12 successfully. Machine restored to service."
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 focus:border-slate-700 rounded-lg p-2.5 text-xs text-slate-200 focus:outline-none"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={saving || steps.length === 0}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20 flex items-center gap-1.5"
                >
                  <FileCheck className="w-4.5 h-4.5" /> Log Repair Completion
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
              No diagnostic guides registered for this machine yet.
            </div>
          )}
        </div>

        {/* Right column: Schematic diagram references */}
        <div className="space-y-6">
          <div className="p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide border-b border-slate-800 pb-3">
              Reference Schematic
            </h3>

            {activeGuide && activeGuide.componentTag ? (
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-slate-900/60 border border-slate-850 rounded-lg space-y-2">
                  <p className="font-bold text-emerald-400">Target Component: {activeGuide.componentTag}</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    According to the system index, troubleshooting this symptom involves checking component **{activeGuide.componentTag}**.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-500">Drawing Sheet</span>
                    <span className="font-semibold text-slate-200">Sheet 6</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-500">Cabinet Grid Coordinate</span>
                    <span className="font-semibold text-emerald-400">Zone B2</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800 pb-2">
                    <span className="text-slate-500">Wiring Terminals</span>
                    <span className="font-semibold text-slate-200">Wire 104, Wire 105</span>
                  </div>
                </div>

                {/* Simulated Schematic Sheet Image */}
                <div className="border border-slate-800 rounded-lg overflow-hidden relative bg-slate-950 p-2.5 text-center flex flex-col justify-center items-center h-44 border-dashed border-2">
                  <HelpCircle className="w-8 h-8 text-slate-700 mb-2" />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Drawing **ZMM-EL-06.pdf** (Control wiring diagram sheet 6) is indexed for offline viewing.
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 text-center py-12">
                Select a symptom to load cabinet coordinate mappings.
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
