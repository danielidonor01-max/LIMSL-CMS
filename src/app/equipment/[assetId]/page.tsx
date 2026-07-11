// src/app/equipment/[assetId]/page.tsx
"use client";

import React, { use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileText,
  Calendar,
  Layers,
  Activity,
  Scan,
  ShieldCheck,
  MapPin,
  Clock,
  Settings,
  ShieldAlert,
  ArrowRight,
  Info,
  History,
  QrCode,
  UserCheck,
  FileCheck,
} from "lucide-react";

// Mock Detailed Equipment profiles
const mockEquipmentDetails: Record<string, any> = {
  "LEE-PE-1904": {
    assetId: "LEE/PE/1904",
    name: "Stako CNC Machine",
    category: "CNC_HEAVY",
    location: "Workshop (Bay 3)",
    oem: "STAKO",
    model: "STAKO v4",
    serialNumber: "STK-2025-098",
    commissioningDate: "2025-06-12",
    warrantyExpiry: "2026-06-12 (Active)",
    status: "BROKEN_DOWN",
    frequency: "Quarterly",
    criticality: "HIGH",
    lastPM: "2025-11-15",
    nextPM: "2026-02-15 (Overdue)",
    assignedTechnician: "Godspower Michael",
    supervisor: "Kingsley Iworah",
    description: "Multi-axis heavy duty cutting and machining center used for flange profiling and precision parts shaping.",
    specifications: {
      powerRating: "45kW",
      voltage: "415V AC, 3-Phase",
      axisCount: "5-Axis servo control",
      coolantCapacity: "120L",
      maxLoad: "5,000kg",
    },
    safetyMeasures: [
      "Permit-to-Work (PTW) required for all electrical/mechanical interventions.",
      "LOTO applied at Feeder Panel DB-CNC3.",
      "PPE required: Steel toe boots, safety glasses, ear protection, flame retardant suit.",
    ],
    openIssue: {
      id: "CM-2026-004",
      title: "No motion X axis",
      reportedDate: "2026-01-07",
      status: "OPEN",
      description: "X-axis travel limit switch triggered or servo drive fault. System displays Error E-041 on boot.",
      assigned: "Marcel Imadojiemu, Godspower Michael",
    },
    history: [
      { id: "WO-902", type: "PM", date: "2025-11-15", result: "COMPLETED", tech: "Godspower Michael", notes: "Filters replaced, axis recalibrated, safety interlocks checked." },
      { id: "WO-871", type: "CM", date: "2025-10-02", result: "RESOLVED", tech: "Marcel Imadojiemu", notes: "Coolant pump seal replaced to resolve minor leakage." },
      { id: "WO-745", type: "PM", date: "2025-08-15", result: "COMPLETED", tech: "Daniel Idonor", notes: "Standard quarterly PM inspection. Everything in range." },
    ],
  },
  "LEE-PE-0399": {
    assetId: "LEE/PE/0399",
    name: "Metal Gennari Vertical Lathe Machine",
    category: "CNC_HEAVY",
    location: "Bay 3",
    oem: "METAL GENNARI",
    model: "MG-VT-2000",
    serialNumber: "MG-99210-2022",
    commissioningDate: "2022-03-10",
    warrantyExpiry: "Expired",
    status: "OPERATIONAL",
    frequency: "Quarterly",
    criticality: "HIGH",
    lastPM: "2026-01-10",
    nextPM: "2026-04-10",
    assignedTechnician: "Godspower Michael",
    supervisor: "Kingsley Iworah",
    description: "Heavy duty vertical turning lathe designed for large diameter cylinder, cap, and flange turning.",
    specifications: {
      powerRating: "55kW",
      voltage: "415V AC, 3-Phase",
      axisCount: "2-Axis vertical layout",
      maxDiameter: "2,000mm",
      maxLoad: "12,000kg",
    },
    safetyMeasures: [
      "Verify safety guard interlocks before operation.",
      "Always apply mechanical chuck locking before manual adjustment.",
    ],
    history: [
      { id: "WO-1011", type: "PM", date: "2026-01-10", result: "COMPLETED", tech: "Godspower Michael", notes: "Chuck lubrication, tool holder check, safety light curtains verified." },
      { id: "WO-891", type: "PM", date: "2025-10-10", result: "COMPLETED", tech: "Daniel Idonor", notes: "Standard quarterly check. Spindle noise within range." },
    ],
  },
};

export default function EquipmentDetail({ params }: { params: Promise<{ assetId: string }> }) {
  const resolvedParams = use(params);
  const assetIdKey = resolvedParams.assetId; // E.g., LEE-PE-1904
  const eq = mockEquipmentDetails[assetIdKey] || mockEquipmentDetails["LEE-PE-1904"]; // Fallback to Stako

  const isBroken = eq.status === "BROKEN_DOWN";

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/equipment" className="p-2 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-white transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
            <Wrench className="w-4.5 h-4.5 text-slate-950 font-bold" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">{eq.name}</h1>
            <p className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase">Asset Twin ID: {eq.assetId}</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/equipment/qr/${assetIdKey}`}
            className="p-2 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 rounded-lg border border-slate-850 transition-all flex items-center gap-1.5 text-xs font-semibold"
          >
            <QrCode className="w-4 h-4" /> Print QR
          </Link>
        </div>
      </header>

      {/* Main Grid */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Status Highlight Banner */}
        <div
          className={`p-5 rounded-xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
            isBroken ? "bg-rose-500/5 border-rose-500/20" : "bg-emerald-500/5 border-emerald-500/20"
          }`}
        >
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isBroken ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
              }`}
            >
              {isBroken ? <AlertTriangle className="w-6 h-6 animate-pulse" /> : <CheckCircle2 className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-xs uppercase font-mono tracking-wider text-slate-400">Current Status</p>
              <h2 className="text-lg font-bold text-white uppercase tracking-wide">
                {eq.status.replace("_", " ")}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {isBroken ? (
              <>
                <Link
                  href={`/corrective/${assetIdKey}/rca`}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-rose-950/20"
                >
                  Conduct Root Cause Analysis (RCA)
                </Link>
                <Link
                  href="/work-orders/new"
                  className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all"
                >
                  Create Work Order
                </Link>
              </>
            ) : (
              <Link
                href="/work-orders/new?type=PM"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition-all shadow-md shadow-emerald-950/20"
              >
                Launch PM Checklist
              </Link>
            )}
          </div>
        </div>

        {/* 2 Column Details Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Column 1 & 2: Machine Spec, Issues, and History */}
          <div className="lg:col-span-2 space-y-6">
            {/* Open Issue Detail */}
            {isBroken && eq.openIssue && (
              <div className="p-5 bg-rose-500/5 border border-rose-500/25 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-rose-400">
                  <ShieldAlert className="w-5 h-5" />
                  <h3 className="text-sm font-bold tracking-wide">Active Corrective Request</h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between border-b border-rose-500/10 pb-2">
                    <span className="font-semibold text-rose-200">{eq.openIssue.title}</span>
                    <span className="font-mono text-slate-400">Reported: {eq.openIssue.reportedDate}</span>
                  </div>
                  <p className="text-slate-300">{eq.openIssue.description}</p>
                  <div className="flex items-center gap-2 pt-2 text-slate-400 font-medium">
                    <UserCheck className="w-3.5 h-3.5 text-rose-400" /> Assigned: {eq.openIssue.assigned}
                  </div>
                </div>
              </div>
            )}

            {/* General Specs */}
            <div className="p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold tracking-wide text-slate-200">Equipment Specifications</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{eq.description}</p>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-2">
                {Object.entries(eq.specifications).map(([key, val]: any) => (
                  <div key={key} className="bg-slate-900/50 p-3 rounded-lg border border-slate-800/40 text-xs">
                    <span className="text-[10px] text-slate-500 uppercase font-mono block mb-1">
                      {key.replace(/([A-Z])/g, " $1")}
                    </span>
                    <span className="font-semibold text-slate-200">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* History Logs */}
            <div className="p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold tracking-wide text-slate-200">Equipment Maintenance History</h3>
                <History className="w-4 h-4 text-slate-500" />
              </div>
              <div className="space-y-4">
                {eq.history.map((log: any, i: number) => (
                  <div key={i} className="flex gap-4 border-b border-slate-800/40 pb-3 last:border-0 last:pb-0 text-xs">
                    <div className="flex flex-col items-center">
                      <span className="font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px]">
                        {log.type}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-1.5 font-mono">{log.date}</span>
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200">{log.id}</span>
                        <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 rounded text-[9px] font-bold border border-emerald-500/10">
                          {log.result}
                        </span>
                      </div>
                      <p className="text-slate-400 text-[11px]">{log.notes}</p>
                      <p className="text-[10px] text-slate-500">Completed by: {log.tech}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 3: Maintenance Status, Safety, OEM */}
          <div className="space-y-6">
            {/* Quick Metrics */}
            <div className="p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-4">
              <h3 className="text-sm font-bold tracking-wide text-slate-200">Maintenance Diagnostics</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-900 rounded-lg text-slate-400">
                    <Clock className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-xs">
                    <p className="text-slate-500 font-mono text-[9px] uppercase">Last Completed PM</p>
                    <p className="font-bold text-slate-200">{eq.lastPM}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-900 rounded-lg text-slate-400">
                    <Calendar className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-xs">
                    <p className="text-slate-500 font-mono text-[9px] uppercase">Next Scheduled PM</p>
                    <p className={`font-bold ${isBroken ? "text-rose-400" : "text-slate-200"}`}>{eq.nextPM}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-900 rounded-lg text-slate-400">
                    <Settings className="w-4.5 h-4.5" />
                  </div>
                  <div className="text-xs">
                    <p className="text-slate-500 font-mono text-[9px] uppercase">Maintenance Cycle</p>
                    <p className="font-bold text-slate-200">{eq.frequency}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Safety Controls */}
            <div className="p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-400">
                <ShieldCheck className="w-4.5 h-4.5" />
                <h3 className="text-sm font-bold tracking-wide">Safety & Compliance</h3>
              </div>
              <ul className="list-disc pl-4 text-xs text-slate-350 space-y-2 leading-relaxed">
                {eq.safetyMeasures.map((measure: string, i: number) => (
                  <li key={i}>{measure}</li>
                ))}
              </ul>
            </div>

            {/* OEM Profile */}
            <div className="p-5 bg-[#0f172a]/40 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-bold tracking-wide text-slate-200">OEM & Warranty Profile</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between border-b border-slate-800/40 pb-2">
                  <span className="text-slate-500">Manufacturer</span>
                  <span className="font-semibold text-slate-200">{eq.oem}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/40 pb-2">
                  <span className="text-slate-500">Model</span>
                  <span className="font-semibold text-slate-200">{eq.model}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/40 pb-2">
                  <span className="text-slate-500">Serial No.</span>
                  <span className="font-semibold text-slate-200 font-mono">{eq.serialNumber}</span>
                </div>
                <div className="flex justify-between border-b border-slate-800/40 pb-2">
                  <span className="text-slate-500">Warranty Coverage</span>
                  <span className="font-semibold text-emerald-400">{eq.warrantyExpiry}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/80 py-4 px-6 text-center text-[10px] text-slate-500 font-mono">
        &copy; {new Date().getFullYear()} Lee International Machinery and Services Limited. | Maintenance Procedure Standard.
      </footer>
    </div>
  );
}
