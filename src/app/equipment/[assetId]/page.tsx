// src/app/equipment/[assetId]/page.tsx
"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Layers,
  Activity,
  ShieldCheck,
  MapPin,
  Clock,
  Settings,
  ShieldAlert,
  History,
  QrCode,
  UserCheck,
  Loader2,
  Info,
  BookOpen,
} from "lucide-react";
import EquipmentDocuments from "@/components/EquipmentDocuments";

// A diagnostic-guide's steps column is JSON that may hold plain strings or
// {step, description} objects. Coerce every element to a string so it can never
// crash the render with "Objects are not valid as a React child".
function parseSteps(raw: unknown): string[] {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((s) =>
      typeof s === "string" ? s : s?.description ?? s?.step ?? JSON.stringify(s),
    );
  } catch {
    return [];
  }
}

export default function EquipmentDetail({ params }: { params: Promise<{ assetId: string }> }) {
  const resolvedParams = use(params);
  const assetIdKey = resolvedParams.assetId; // E.g., LEE-PE-1904 or eq-stako-1904
  const assetIdOriginal = assetIdKey.replace(/-/g, "/");

  const [eq, setEq] = useState<any>(null);
  const [components, setComponents] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("specs");

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Fetch asset details
        const res = await fetch(`/api/equipment/${assetIdKey}`);
        if (res.ok) {
          const data = await res.json();
          setEq(data);

          // 2. Fetch components (BOM)
          const compRes = await fetch(`/api/equipment/${assetIdKey}/components`);
          if (compRes.ok) {
            const compData = await compRes.json();
            setComponents(compData);
          }

          // 3. Fetch diagnostic guides
          const guideRes = await fetch(`/api/equipment/${assetIdKey}/diagnostics`);
          if (guideRes.ok) {
            const guideData = await guideRes.json();
            setGuides(guideData);
          }
        }
      } catch (err) {
        console.error("Error loading twin details:", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [assetIdKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-mono text-xs gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-450" /> Loading twin telemetry...
      </div>
    );
  }

  if (!eq) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-500 font-mono text-xs gap-4">
        <AlertTriangle className="w-8 h-8 text-rose-500" /> Asset Digital Twin not found.
        <Link href="/equipment" className="text-emerald-600 underline">Return to Registry</Link>
      </div>
    );
  }

  const isBroken = eq.status === "BROKEN_DOWN";

  // Safety guidance derived from the machine's real attributes — no fabricated,
  // machine-specific isolation points (those live in the machine's WMS / PTW).
  const safetyMeasures = [
    "Permit-to-Work (PTW) required before any electrical or mechanical intervention.",
    "Apply LOTO and confirm isolation before work begins — isolation points are defined in the machine's Work Method Statement.",
    (eq.criticality === "CRITICAL" || eq.criticality === "HIGH")
      ? "High-criticality asset — Maintenance Manager sign-off required on close-out."
      : null,
    eq.requiresCalibration
      ? "Calibration required — verify the current certificate before returning to service."
      : null,
    "PPE as specified on the active Permit-to-Work.",
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Header */}

      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-3">
          <Link href="/equipment" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">{eq.name}</h1>
            <p className="text-[10px] text-emerald-600 font-mono tracking-wider uppercase">Asset Twin ID: {eq.assetId}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/equipment/qr/${assetIdKey}`}
            className="p-2 hover:bg-slate-200 text-emerald-600 hover:text-emerald-700 rounded-lg border border-slate-200 transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <QrCode className="w-4 h-4" /> Print QR
          </Link>
        </div>
        </div>
        {/* Status Highlight Banner */}
        <div
          className={`p-5 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
            isBroken ? "bg-rose-500/5 border-rose-500/20" : "bg-emerald-500/5 border-emerald-500/20"
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isBroken ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600"
              }`}
            >
              {isBroken ? <AlertTriangle className="w-6 h-6 animate-pulse" /> : <CheckCircle2 className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-xs uppercase font-mono tracking-wider text-slate-500">Current Status</p>
              <h2 className="text-lg font-bold text-slate-900 uppercase tracking-wide">
                {eq.status.replace("_", " ")}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {isBroken ? (
              <>
                <Link
                  href={`/equipment/${assetIdKey}/troubleshoot`}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-rose-950/20"
                >
                  Launch Troubleshooting Wizard
                </Link>
                <Link
                  href="/work-orders/new"
                  className="px-4 py-2 bg-slate-100 border border-slate-200 hover:border-slate-300 text-slate-900 rounded-lg text-xs font-semibold transition-all"
                >
                  Create Work Order
                </Link>
              </>
            ) : (
              <Link
                href="/work-orders/new?type=PM"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
              >
                Launch PM Checklist
              </Link>
            )}
          </div>
        </div>

        {/* Tab Headers */}
        <div className="flex border-b border-slate-200 gap-6 text-xs font-bold uppercase tracking-wider">
          <button
            onClick={() => setActiveTab("specs")}
            className={`pb-2.5 transition-all border-b-2 ${
              activeTab === "specs" ? "text-emerald-600 border-emerald-500" : "text-slate-500 border-transparent hover:text-slate-900"
            }`}
          >
            Specifications
          </button>
          <button
            onClick={() => setActiveTab("troubleshooting")}
            className={`pb-2.5 transition-all border-b-2 ${
              activeTab === "troubleshooting" ? "text-emerald-600 border-emerald-500" : "text-slate-500 border-transparent hover:text-slate-900"
            }`}
          >
            Diagnostics & BOM
          </button>
          <button
            onClick={() => setActiveTab("safety")}
            className={`pb-2.5 transition-all border-b-2 ${
              activeTab === "safety" ? "text-emerald-600 border-emerald-500" : "text-slate-500 border-transparent hover:text-slate-900"
            }`}
          >
            Safety & OEM
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === "specs" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* General Specs */}
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <h3 className="text-sm font-bold tracking-wide text-slate-900">Equipment Specifications</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {eq.notes || "No description recorded for this asset."}
                </p>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 text-xs">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Manufacturer</span>
                    <span className="font-semibold text-slate-900">{eq.oem || "—"}</span>
                  </div>
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 text-xs">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Model</span>
                    <span className="font-semibold text-slate-900">{eq.model || "—"}</span>
                  </div>
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 text-xs">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block mb-1">Serial Number</span>
                    <span className="font-semibold text-slate-900 font-mono">{eq.serialNumber || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Basic History */}
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <h3 className="text-sm font-bold tracking-wide text-slate-900">Maintenance Diagnostics</h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                      <Clock className="w-5 h-5" />
                    </div>
                    <div className="text-xs">
                      <p className="text-slate-500 font-mono text-[9px] uppercase">Last Completed PM</p>
                      <p className="font-bold text-slate-900">{eq.lastMaintenanceDate || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div className="text-xs">
                      <p className="text-slate-500 font-mono text-[9px] uppercase">Next Scheduled PM</p>
                      <p className={`font-bold ${isBroken ? "text-rose-600" : "text-slate-900"}`}>{eq.nextMaintenanceDate || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar quick facts */}
            <div className="space-y-6">
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <h3 className="text-sm font-bold tracking-wide text-slate-900">Asset Facts</h3>
                <div className="space-y-3 text-xs">
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Bay Location</span>
                    <span className="font-semibold text-slate-900">{eq.location || "—"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Criticality</span>
                    <span className="font-semibold text-slate-900">{eq.criticality || "—"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-200 pb-2">
                    <span className="text-slate-500">Frequency</span>
                    <span className="font-semibold text-slate-900">{eq.maintenanceFrequency || "—"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* NEW Diagnostics & BOM Tab */}
        {activeTab === "troubleshooting" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: BOM components list */}
            <div className="lg:col-span-2 space-y-6">
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold tracking-wide text-slate-900">Component Bill of Materials (BOM)</h3>
                  <span className="text-[10px] text-slate-500 font-mono">{components.length} components registered</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {components.map((comp) => {
                    return (
                      <div key={comp.id} className="p-4 bg-slate-100 border border-slate-200 rounded-lg space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-[9px] font-bold text-emerald-600">
                              {comp.componentTag}
                            </span>
                            <h4 className="text-xs font-bold text-slate-250 mt-1">{comp.name}</h4>
                          </div>
                          <span className="text-[9px] uppercase font-mono text-slate-500">{comp.type}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 space-y-1 font-mono leading-tight">
                          <p><span className="text-slate-600">Location:</span> {comp.location || "N/A"}</p>
                          <p><span className="text-slate-600">Ref Drawing:</span> {comp.schematicReference || "N/A"}</p>
                          {comp.manufacturer && (
                            <p><span className="text-slate-600">Part:</span> {comp.manufacturer} ({comp.modelNumber})</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right Column: Step-by-step diagnostic hint card blocks */}
            <div className="space-y-6">
              {isBroken && guides.length > 0 ? (
                <div className="p-5 bg-rose-500/5 border border-rose-500/25 rounded-xl space-y-4">
                  <div className="flex items-center gap-2 text-rose-600">
                    <ShieldAlert className="w-5 h-5 animate-pulse" />
                    <h3 className="text-sm font-bold tracking-wide">Suggested Diagnostic Path</h3>
                  </div>

                  {guides.map((guide) => {
                    const steps = parseSteps(guide.diagnosticSteps);
                    return (
                      <div key={guide.id} className="space-y-4">
                        <div className="text-xs">
                          <p className="font-semibold text-slate-900">Symptom: "{guide.symptom}"</p>
                          <p className="text-slate-500 mt-1">**Probable Cause:** {guide.probableCause}</p>
                        </div>
                        <div className="space-y-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">Verification Checklist</span>
                          <div className="space-y-1.5">
                            {steps.map((step: string, i: number) => (
                              <label key={i} className="flex gap-2 items-start text-xs text-slate-600 select-none">
                                <input type="checkbox" className="rounded border-slate-200 bg-white text-rose-500 focus:ring-0 w-3.5 h-3.5 mt-0.5" />
                                <span>{step}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <Link
                          href={`/equipment/${assetIdKey}/troubleshoot`}
                          className="w-full flex items-center justify-center gap-1.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
                        >
                          <BookOpen className="w-4 h-4" /> Open Troubleshooting Wizard
                        </Link>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-5 bg-slate-100 border border-slate-200 rounded-xl text-center space-y-2">
                  <Info className="w-6 h-6 text-slate-500 mx-auto" />
                  <h4 className="text-xs font-bold text-slate-700">No Active Faults</h4>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Machinery is operational. You can view registered schematics and BOM list, or launch the manual wizard.
                  </p>
                  <Link
                    href={`/equipment/${assetIdKey}/troubleshoot`}
                    className="mt-3 w-full flex items-center justify-center gap-1 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded text-[11px] font-semibold transition-all"
                  >
                    Launch Guide Wizard
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Safety Tab */}
        {activeTab === "safety" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-emerald-600">
                  <ShieldCheck className="w-5 h-5" />
                  <h3 className="text-sm font-bold tracking-wide">Safety & Compliance</h3>
                </div>
                <ul className="list-disc pl-4 text-xs text-slate-600 space-y-2 leading-relaxed">
                  {safetyMeasures.map((measure, i) => (
                    <li key={i}>{measure}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-6">
              <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3">
                <h3 className="text-sm font-bold tracking-wide text-slate-900">Warranty Coverage</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Status</span>
                    <span className={`font-semibold ${
                      eq.warrantyExpiry && new Date(eq.warrantyExpiry) >= new Date() ? "text-emerald-600" : "text-slate-500"
                    }`}>
                      {eq.warrantyExpiry
                        ? (new Date(eq.warrantyExpiry) >= new Date() ? "In warranty" : "Expired")
                        : "Not recorded"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Expiry</span>
                    <span className="font-semibold text-slate-900">{eq.warrantyExpiry || "—"}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 pt-1">Full OEM terms are in the OEM &amp; Warranty module.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Per-machine document register (live) */}
        <EquipmentDocuments assetId={assetIdKey} />
      </main>

    </div>
  );
}
