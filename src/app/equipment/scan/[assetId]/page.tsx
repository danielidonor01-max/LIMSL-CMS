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

// Two shapes in one response, and the split is the design. `equipment` and
// `safety` answer "is this safe to touch" and are public, because the sticker is
// useless if the answer needs a login. `details` is the business record and
// arrives only when signed in.
interface ScanData {
  signedIn: boolean;
  equipment: {
    id: string;
    assetId: string;
    name: string;
    category: string;
    categoryLabel: string;
    location?: string | null;
    bay?: string | null;
    status: string;
    statusLabel: string;
  };
  safety: {
    isSafeToOperate: boolean;
    hasLoto: boolean;
    // A count, not the permits. That work is happening is a safety fact; what
    // the job is, is a map of the week's operations.
    activePermitCount: number;
    recommendedPPE: string[];
  };
  contacts: Array<{
    name: string;
    organisation?: string | null;
    kind: string;
    phone: string;
  }>;
  details: {
    oem?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    subCategory?: string | null;
    criticality?: string | null;
    commissioningDate?: string | null;
    lastMaintenanceDate?: string | null;
    nextMaintenanceDate?: string | null;
    maintenanceFrequency?: string | null;
    requiresCalibration?: boolean | null;
  } | null;
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
      <div className="min-h-screen bg-ink-950 text-ink-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center mb-4 shadow-lg shadow-brand-500/10">
          <Loader2 className="w-7 h-7 text-brand-400 animate-spin" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-ink-200">
          Verifying Machine Telemetry...
        </p>
        <p className="text-xs text-ink-500 font-mono mt-1 uppercase">
          Tag: {assetIdOriginal}
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-ink-950 text-ink-100 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-danger-500/10 border border-danger-500/30 flex items-center justify-center mb-4 text-danger-400">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h1 className="text-lg font-bold text-white mb-2">Tag Not Found</h1>
        <p className="text-sm text-ink-400 max-w-xs mb-6">
          {error || "The requested equipment tag could not be located."}
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-800 hover:bg-ink-700 text-ink-200 text-xs font-semibold rounded-xl transition"
        >
          Sign in to LIMSL CMS <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const { equipment: eq, safety, contacts, details } = data;

  // Status badges config
  const statusConfig: Record<
    string,
    { label: string; bg: string; text: string; border: string; dot: string }
  > = {
    OPERATIONAL: {
      label: "Operational",
      bg: "bg-brand-500/10",
      text: "text-brand-400",
      border: "border-brand-500/30",
      dot: "bg-brand-400",
    },
    UNDER_MAINTENANCE: {
      label: "Under Maintenance",
      bg: "bg-warn-500/10",
      text: "text-warn-400",
      border: "border-warn-500/30",
      dot: "bg-warn-400",
    },
    BROKEN_DOWN: {
      label: "Broken Down / Out of Order",
      bg: "bg-danger-500/10",
      text: "text-danger-400",
      border: "border-danger-500/30",
      dot: "bg-danger-400",
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
      bg: "bg-ink-800",
      text: "text-ink-400",
      border: "border-ink-700",
      dot: "bg-ink-500",
    },
  };

  const currentStatus =
    statusConfig[eq.status] || {
      label: eq.status.replace(/_/g, " "),
      bg: "bg-ink-800",
      text: "text-ink-300",
      border: "border-ink-700",
      dot: "bg-ink-400",
    };

  // Next Maintenance Countdown
  let daysUntilPM: number | null = null;
  let isOverdue = false;
  if (details?.nextMaintenanceDate) {
    const due = new Date(details.nextMaintenanceDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    daysUntilPM = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    isOverdue = daysUntilPM < 0;
  }

  return (
    <div className="min-h-screen bg-[#070b14] text-ink-100 flex flex-col font-sans selection:bg-brand-500/30">
      {/* Top Industrial Brand Bar */}
      <header className="border-b border-ink-800/80 bg-ink-900/60 backdrop-blur-md sticky top-0 z-50 px-4 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center shadow-md shadow-brand-500/20">
            <Wrench className="w-4 h-4 text-ink-950 font-black" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black tracking-tight text-white">
                LEE MACHINERY
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 uppercase tracking-widest font-mono">
                Verified Asset
              </span>
            </div>
            <p className="text-[9px] text-ink-400 font-mono tracking-wider">
              LIMSL Computerized Maintenance Registry
            </p>
          </div>
        </div>

        {/* Auth Shortcut pill */}
        {authStatus === "authenticated" ? (
          <Link
            href={`/equipment/${assetIdKey}`}
            className="flex items-center gap-1 text-[11px] font-semibold text-brand-400 hover:text-brand-300 bg-brand-950/40 border border-brand-500/30 px-2.5 py-1.5 rounded-lg transition"
          >
            Open Console <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`/equipment/${assetIdKey}`)}`}
            className="flex items-center gap-1 text-[11px] font-semibold text-ink-300 hover:text-white bg-ink-800 hover:bg-ink-700 px-2.5 py-1.5 rounded-lg border border-ink-700 transition"
          >
            Staff Login <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-lg w-full mx-auto p-4 space-y-4">
        {/* Machine Identity Banner */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-ink-900/90 to-ink-900/40 border border-ink-800 shadow-xl space-y-3 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold tracking-widest text-brand-400 uppercase bg-brand-500/10 px-2 py-0.5 rounded border border-brand-500/20">
                  {eq.assetId}
                </span>
                {details?.criticality && (
                  <span
                    className={`text-[9px] font-mono uppercase px-2 py-0.5 rounded font-bold border ${
                      details.criticality === "CRITICAL"
                        ? "bg-danger-500/10 text-danger-400 border-danger-500/30"
                        : details.criticality === "HIGH"
                        ? "bg-warn-500/10 text-warn-400 border-warn-500/30"
                        : "bg-ink-800 text-ink-400 border-ink-700"
                    }`}
                  >
                    {details.criticality} CRITICALITY
                  </span>
                )}
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight mt-2 leading-snug">
                {eq.name}
              </h1>
              <p className="text-xs text-ink-400 flex items-center gap-1.5 mt-1 font-medium">
                <MapPin className="w-3.5 h-3.5 text-ink-500 shrink-0" />
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
                <p className="text-[10px] uppercase font-mono tracking-wider text-ink-400">
                  Current Status
                </p>
                <p className={`text-sm font-bold ${currentStatus.text}`}>
                  {currentStatus.label}
                </p>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[10px] uppercase font-mono tracking-wider text-ink-400">
                Category
              </p>
              <p className="text-xs font-semibold text-ink-200">
                {eq.category?.replace(/_/g, " ")}
              </p>
            </div>
          </div>

          {/* Safety & ISO 45001 Compliance Warning */}
          {safety.hasLoto || !safety.isSafeToOperate ? (
            <div className="p-3.5 rounded-xl bg-danger-950/30 border border-danger-500/40 text-danger-300 space-y-1.5">
              <div className="flex items-center gap-2 text-danger-400 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>SAFETY CAUTION — ACCESS RESTRICTED</span>
              </div>
              <p className="text-xs text-danger-200/90 leading-relaxed">
                {safety.hasLoto
                  ? "LOCKOUT / TAGOUT (LOTO) is active on this equipment. Do not energize, operate, or remove isolations."
                  : "This asset is currently out of normal service or undergoing active maintenance. Standard operation is prohibited."}
              </p>
              {safety.activePermitCount > 0 && (
                <div className="pt-1 text-[11px] text-danger-300/80">
                  {safety.activePermitCount === 1
                    ? "A permit to work is live on this machine."
                    : `${safety.activePermitCount} permits to work are live on this machine.`}{" "}
                  Sign in to see which.
                </div>
              )}
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-brand-950/20 border border-brand-500/30 text-brand-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-brand-400 block">
                  Cleared for Operation (ISO 45001)
                </span>
                <span className="text-brand-200/80 leading-relaxed text-[11px]">
                  No active Lockout/Tagout. Safe to operate in accordance with standard operating procedures and mandatory PPE.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Signed in only. Asset IDs run in sequence, so anything public here
            can be walked from LEE/PE/0001 upward by anyone who scans one
            sticker, and a public register of every machine LIMSL owns with its
            make and serial is not a safety feature. */}
        {details && (
        <div className="bg-ink-900/60 border border-ink-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-ink-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-ink-400" />
            Machine Specifications
          </h2>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-ink-950/60 p-2.5 rounded-xl border border-ink-800/80">
              <span className="text-[10px] text-ink-500 block uppercase font-mono">
                Manufacturer / OEM
              </span>
              <span className="font-semibold text-ink-200 block truncate">
                {details.oem || "—"}
              </span>
            </div>

            <div className="bg-ink-950/60 p-2.5 rounded-xl border border-ink-800/80">
              <span className="text-[10px] text-ink-500 block uppercase font-mono">
                Model Number
              </span>
              <span className="font-semibold text-ink-200 block truncate">
                {details.model || "—"}
              </span>
            </div>

            <div className="bg-ink-950/60 p-2.5 rounded-xl border border-ink-800/80">
              <span className="text-[10px] text-ink-500 block uppercase font-mono">
                Serial Number
              </span>
              <span className="font-mono text-ink-300 block truncate">
                {details.serialNumber || "—"}
              </span>
            </div>

            <div className="bg-ink-950/60 p-2.5 rounded-xl border border-ink-800/80">
              <span className="text-[10px] text-ink-500 block uppercase font-mono">
                Sub-Category
              </span>
              <span className="font-semibold text-ink-300 block truncate">
                {details.subCategory || "—"}
              </span>
            </div>
          </div>
        </div>
        )}

        {/* Signed in only, for the same reason as the specifications above. */}
        {details && (
        <div className="bg-ink-900/60 border border-ink-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-ink-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-ink-400" />
            Maintenance & Inspection Schedule
          </h2>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <span className="text-[10px] text-ink-500 block uppercase font-mono">
                Last Service Date
              </span>
              <span className="font-semibold text-ink-200 block mt-0.5">
                {details.lastMaintenanceDate || "—"}
              </span>
              <span className="text-[10px] text-ink-500 block mt-0.5">
                Cadence: {details.maintenanceFrequency || "Monthly"}
              </span>
            </div>

            <div className="bg-ink-950/60 p-3 rounded-xl border border-ink-800/80">
              <span className="text-[10px] text-ink-500 block uppercase font-mono">
                Next Scheduled PM
              </span>
              <span
                className={`font-semibold block mt-0.5 ${
                  isOverdue ? "text-danger-400" : "text-brand-400"
                }`}
              >
                {details.nextMaintenanceDate || "Not Scheduled"}
              </span>
              {daysUntilPM !== null && (
                <span
                  className={`text-[10px] block mt-0.5 font-mono ${
                    isOverdue ? "text-danger-400 font-bold" : "text-ink-400"
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
            {details.requiresCalibration && (
              <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Periodic Calibration Required
              </span>
            )}
          </div>
        </div>
        )}

        {/* Required PPE Zone Guidelines */}
        <div className="bg-ink-900/60 border border-ink-800 rounded-2xl p-4 space-y-2.5 shadow-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-ink-400 flex items-center gap-1.5">
            <HardHat className="w-3.5 h-3.5 text-warn-400" />
            Mandatory PPE in Machine Zone
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {safety.recommendedPPE.map((ppe, i) => (
              <span
                key={i}
                className="text-[11px] bg-ink-950 border border-ink-800 px-2.5 py-1 rounded-lg text-ink-300 font-medium flex items-center gap-1"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-warn-400 shrink-0" />
                {ppe}
              </span>
            ))}
          </div>
        </div>

        {/* Emergency Assistance Hotlines */}
        <div className="bg-ink-900/60 border border-ink-800 rounded-2xl p-4 space-y-2.5 shadow-lg">
          <h2 className="text-xs font-bold uppercase tracking-wider font-mono text-ink-400 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-brand-400" />
            Immediate Assistance & Hotlines
          </h2>
          <div className="space-y-2">
            {contacts.length === 0 && (
              <p className="text-[11px] text-ink-400 leading-relaxed">
                No emergency contacts have been recorded yet. Nothing is invented here on purpose:
                a wrong number on this page is discovered by whoever dials it.
              </p>
            )}
            {contacts.map((contact, idx) => (
              <a
                key={idx}
                href={`tel:${contact.phone.replace(/\s+/g, "")}`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-ink-950/70 border border-ink-800 hover:border-ink-700 transition text-xs group"
              >
                <div>
                  <p className="font-semibold text-ink-200 group-hover:text-white">
                    {contact.name}
                  </p>
                  <p className="text-[10px] text-ink-400">
                    {contact.organisation
                      ? `${contact.kind} · ${contact.organisation}`
                      : contact.kind}
                  </p>
                </div>
                <span className="font-mono text-brand-400 font-semibold flex items-center gap-1 bg-brand-500/10 px-2.5 py-1 rounded-lg border border-brand-500/20">
                  <Phone className="w-3 h-3" /> {contact.phone}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* GATED ACCESS / LOGIN INITIATION CARD */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-brand-950/40 via-ink-900 to-ink-950 border border-brand-500/30 shadow-2xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Authorized Personnel Access
              </h3>
              <p className="text-xs text-ink-300 mt-0.5 leading-relaxed">
                Log in to access complete engineering drawings, raise corrective work orders, record meter readings, and view SOPs.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-ink-300 font-medium">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>Wiring Schematics</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>Raise Work Orders</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>WMS & Procedures</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 shrink-0" />
              <span>AI Troubleshooting</span>
            </div>
          </div>

          {authStatus === "authenticated" ? (
            <div className="pt-1">
              <div className="p-3 rounded-xl bg-ink-900/80 border border-brand-500/20 mb-3 flex items-center justify-between text-xs">
                <div>
                  <span className="text-ink-400 block text-[10px]">
                    Logged in as:
                  </span>
                  <span className="font-bold text-white">
                    {session.user?.name || session.user?.email}
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded border border-brand-500/30">
                  {(session.user as any)?.role || "USER"}
                </span>
              </div>

              <Link
                href={`/equipment/${assetIdKey}`}
                className="w-full py-3 px-4 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-950/40 transition"
              >
                Open Full Machine Digital Twin
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/equipment/${assetIdKey}`)}`}
              className="w-full py-3.5 px-4 rounded-xl bg-brand-500 hover:bg-brand-400 text-ink-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-brand-950/40 transition hover:scale-[1.01]"
            >
              Sign In with LIMSL Credentials
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {/* Footer info */}
        <p className="text-[10px] text-ink-500 text-center font-mono py-2">
          LEE INTERNATIONAL MACHINERY & SERVICES LTD · ISO 45001 & ISO 9001
        </p>
      </main>
    </div>
  );
}
