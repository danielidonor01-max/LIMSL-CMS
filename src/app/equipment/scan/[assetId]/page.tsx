// src/app/equipment/scan/[assetId]/page.tsx
"use client";

import React, { use, useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Wrench,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Calendar,
  MapPin,
  Clock,
  Lock,
  ArrowRight,
  Phone,
  HardHat,
  Cpu,
  FileText,
  Activity,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";

interface ScanData {
  equipment: {
    id: string;
    assetId: string;
    name: string;
    category: string;
    subCategory?: string;
    location?: string;
    bay?: string;
    oem?: string;
    model?: string;
    serialNumber?: string;
    status: string;
    criticality?: string;
    commissioningDate?: string;
    lastMaintenanceDate?: string;
    nextMaintenanceDate?: string;
    maintenanceFrequency?: string;
    requiresCalibration?: boolean;
    requiresPremob?: boolean;
  };
  safety: {
    isSafeToOperate: boolean;
    hasLoto: boolean;
    activePermitCount: number;
    activePermits: Array<{
      permitNumber: string;
      workDescription: string;
      lotoApplied: boolean | null;
      expiryDate: string | null;
    }>;
    recommendedPPE: string[];
  };
  emergencyContacts: Array<{
    name: string;
    role: string;
    phone: string;
  }>;
  scannedAt: string;
}

export default function PublicScanPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const resolvedParams = use(params);
  const assetIdKey = resolvedParams.assetId; // E.g. LEE-PE-1904
  const assetIdOriginal = assetIdKey.replace(/-/g, "/");

  const { data: session, status: authStatus } = useSession();
  const [data, setData] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchScanData() {
      try {
        const res = await fetch(`/api/equipment/scan/${assetIdKey}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError("Asset Tag not registered in LIMSL CMS.");
          } else {
            setError("Unable to read machine telemetry at this time.");
          }
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError("Network error connecting to LIMSL machine register.");
      } finally {
        setLoading(false);
      }
    }
    fetchScanData();
  }, [assetIdKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/10">
          <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-slate-200">
          Verifying Machine Telemetry...
        </p>
        <p className="text-xs text-slate-500 font-mono mt-1 uppercase">
          Tag: {assetIdOriginal}
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4 text-rose-400">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-bold text-white mb-2">Tag Not Found</h1>
        <p className="text-sm text-slate-400 max-w-xs mb-6">
          {error || "The requested equipment tag could not be located."}
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
        >
          Sign in to LIMSL CMS <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const { equipment: eq, safety, emergencyContacts } = data;

  // Status badges config
  const statusConfig: Record<
    string,
    { label: string; bg: string; text: string; border: string; dot: string }
  > = {
    OPERATIONAL: {
      label: "Operational",
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/30",
      dot: "bg-emerald-400",
    },
    UNDER_MAINTENANCE: {
      label: "Under Maintenance",
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/30",
      dot: "bg-amber-400",
    },
    BROKEN_DOWN: {
      label: "Broken Down / Out of Order",
      bg: "bg-rose-500/10",
      text: "text-rose-400",
      border: "border-rose-500/30",
      dot: "bg-rose-400",
    },
    AWAITING_PARTS: {
      label: "Awaiting Spare Parts",
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      border: "border-orange-500/30",
      dot: "bg-orange-400",
    },
    DECOMMISSIONED: {
      label: "Decommissioned",
      bg: "bg-slate-800",
      text: "text-slate-400",
      border: "border-slate-700",
      dot: "bg-slate-500",
    },
  };

  const currentStatus =
    statusConfig[eq.status] || {
      label: eq.status.replace(/_/g, " "),
      bg: "bg-slate-800",
      text: "text-slate-300",
      border: "border-slate-700",
      dot: "bg-slate-400",
    };

  // Next Maintenance Countdown
  let daysUntilPM: number | null = null;
  let isOverdue = false;
  if (eq.nextMaintenanceDate) {
    const due = new Date(eq.nextMaintenanceDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    daysUntilPM = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    isOverdue = daysUntilPM < 0;
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      {/* Top Industrial Brand Bar */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
            <Wrench className="w-4 h-4 text-slate-950 font-black" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-tight text-white">
                LEE MACHINERY
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-widest font-mono">
                Verified Asset
              </span>
            </div>
            <p className="text-[9px] text-slate-400 font-mono tracking-wider">
              LIMSL Computerized Maintenance Registry
            </p>
          </div>
        </div>

        {/* Auth Shortcut pill */}
        {authStatus === "authenticated" ? (
          <Link
            href={`/equipment/${assetIdKey}`}
            className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1.5 rounded-lg transition"
          >
            Open Console <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/equipment/${assetIdKey}`)}`}
            className="flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
          >
            Staff Login <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* Machine Identity Banner */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-900/40 border border-slate-800 shadow-xl space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold tracking-widest text-emerald-400 uppercase bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {eq.assetId}
                </span>
                {eq.criticality && (
                  <span
                    className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                      eq.criticality === "CRITICAL"
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : eq.criticality === "HIGH"
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {eq.criticality} CRITICALITY
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight mt-2 leading-snug">
                {eq.name}
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 font-medium">
                <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                {eq.location || "Central Workshop"}
                {eq.bay ? ` · ${eq.bay}` : ""}
              </p>
            </div>
          </div>

          {/* Live Operational Status Card */}
          <div
            className={`p-3.5 rounded-xl border ${currentStatus.border} ${currentStatus.bg} flex items-center justify-between transition-all`}
          >
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-3 w-3">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${currentStatus.dot}`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3 w-3 ${currentStatus.dot}`}
                />
              </span>
              <div>
                <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                  Current Status
                </p>
                <p className={`text-sm font-bold ${currentStatus.text}`}>
                  {currentStatus.label}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                Category
              </p>
              <p className="text-xs font-semibold text-slate-200">
                {eq.category?.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          {/* Safety & ISO 45001 Compliance Warning */}
          {safety.hasLoto || !safety.isSafeToOperate ? (
            <div className="p-3.5 rounded-xl bg-rose-950/30 border border-rose-500/40 text-rose-300 space-y-1.5">
              <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>SAFETY CAUTION — ACCESS RESTRICTED</span>
              </div>
              <p className="text-xs text-rose-200/90 leading-relaxed">
                {safety.hasLoto
                  ? "LOCKOUT / TAGOUT (LOTO) is active on this equipment. Do not energize, operate, or remove isolations."
                  : "This asset is currently out of normal service or undergoing active maintenance. Standard operation is prohibited."}
              </p>
              {safety.activePermits.length > 0 && (
                <div className="pt-1 text-[11px] font-mono text-rose-300/80">
                  Active Permit: {safety.activePermits[0].permitNumber} —{" "}
                  {safety.activePermits[0].workDescription}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-emerald-400 block">
                  Cleared for Operation (ISO 45001)
                </span>
                <span className="text-emerald-200/80 leading-relaxed text-[11px]">
                  No active Lockout/Tagout. Safe to operate in accordance with standard operating procedures and mandatory PPE.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Technical Specs & Identity Grid */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-400" />
            Machine Specifications
          </h2>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">
                Manufacturer / OEM
              </span>
              <span className="font-semibold text-slate-200 block truncate">
                {eq.oem || "—"}
              </span>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">
                Model Number
              </span>
              <span className="font-semibold text-slate-200 block truncate">
                {eq.model || "—"}
              </span>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">
                Serial Number
              </span>
              <span className="font-mono text-slate-300 block truncate">
                {eq.serialNumber || "—"}
              </span>
            </div>

            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">
                Sub-Category
              </span>
              <span className="font-semibold text-slate-300 block truncate">
                {eq.subCategory || "Fabrication"}
              </span>
            </div>
          </div>
        </div>

        {/* Maintenance Schedule & Calibration Status */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            Maintenance & Inspection Schedule
          </h2>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">
                Last Service Date
              </span>
              <span className="font-semibold text-slate-200 block mt-0.5">
                {eq.lastMaintenanceDate || "—"}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                Cadence: {eq.maintenanceFrequency || "Monthly"}
              </span>
            </div>

            <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
              <span className="text-[10px] text-slate-500 block uppercase font-mono">
                Next Scheduled PM
              </span>
              <span
                className={`font-semibold block mt-0.5 ${
                  isOverdue ? "text-rose-400" : "text-emerald-400"
                }`}
              >
                {eq.nextMaintenanceDate || "Not Scheduled"}
              </span>
              {daysUntilPM !== null && (
                <span
                  className={`text-[10px] block mt-0.5 font-mono ${
                    isOverdue ? "text-rose-400 font-bold" : "text-slate-400"
                  }`}
                >
                  {isOverdue
                    ? `⚠️ ${Math.abs(daysUntilPM)} days overdue`
                    : `In ${daysUntilPM} days`}
                </span>
              )}
            </div>
          </div>

          {/* Compliance flags */}
          <div className="flex flex-wrap gap-2 pt-1">
            {eq.requiresCalibration && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Periodic Calibration Required
              </span>
            )}
            {eq.requiresPremob && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Pre-Mobilization Certified
              </span>
            )}
          </div>
        </div>

        {/* Required PPE Zone Guidelines */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-400 flex items-center gap-1.5">
            <HardHat className="w-3.5 h-3.5 text-amber-400" />
            Mandatory PPE in Machine Zone
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {safety.recommendedPPE.map((ppe, i) => (
              <span
                key={i}
                className="text-[11px] bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-slate-300 font-medium flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                {ppe}
              </span>
            ))}
          </div>
        </div>

        {/* Emergency Assistance Hotlines */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2.5 shadow-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-slate-400 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-emerald-400" />
            Immediate Assistance & Hotlines
          </h2>
          <div className="space-y-2">
            {emergencyContacts.map((contact, idx) => (
              <a
                key={idx}
                href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition text-xs group"
              >
                <div>
                  <p className="font-semibold text-slate-200 group-hover:text-white">
                    {contact.name}
                  </p>
                  <p className="text-[10px] text-slate-400">{contact.role}</p>
                </div>
                <span className="font-mono text-emerald-400 font-semibold flex items-center gap-1 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                  <Phone className="w-3 h-3" /> {contact.phone}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* GATED ACCESS / LOGIN INITIATION CARD */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 shadow-2xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Authorized Personnel Access
              </h3>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                Log in to access complete engineering drawings, raise corrective work orders, record meter readings, and view SOPs.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 font-medium">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Wiring Schematics</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Raise Work Orders</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>WMS & Procedures</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>AI Troubleshooting</span>
            </div>
          </div>

          {authStatus === "authenticated" ? (
            <div className="pt-1">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-emerald-500/20 mb-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">
                    Logged in as:
                  </span>
                  <span className="font-bold text-white">
                    {session.user?.name || session.user?.email}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/30">
                  {(session.user as any)?.role || "USER"}
                </span>
              </div>

              <Link
                href={`/equipment/${assetIdKey}`}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition"
              >
                Open Full Machine Digital Twin
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/equipment/${assetIdKey}`)}`}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 transition hover:scale-[1.01]"
            >
              Sign In with LIMSL Credentials
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Footer info */}
        <p className="text-[10px] text-slate-500 text-center font-mono py-2">
          LEE INTERNATIONAL MACHINERY & SERVICES LTD · ISO 45001 & ISO 9001
        </p>
      </main>
    </div>
  );
}
