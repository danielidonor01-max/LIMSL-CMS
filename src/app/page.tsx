// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  FileText,
  Calendar,
  Layers,
  Activity,
  ClipboardList,
  ShieldCheck,
  TrendingUp,
  Building2,
  Gauge,
  Loader2,
  PenLine,
  ChevronRight,
  GraduationCap,
  BookText,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import { canAccessPath, ROLE_LABELS } from "@/lib/roles";
import {
  EQUIPMENT_STATUS_BADGE,
  EQUIPMENT_STATUS_LABELS,
} from "@/lib/constants";

type SignoffItem = {
  stepId: string;
  entityType: string;
  typeLabel: string;
  reference: string;
  roleLabel: string;
  link: string;
};

type Stat = { title: string; value: string; target: string; status: string; desc: string; code: string };
type Equip = {
  id: string;
  assetId: string;
  name: string;
  location: string | null;
  bay: string | null;
  status: string;
  criticality: string | null;
  nextMaintenanceDate: string | null;
};
type Audit = {
  id: string;
  action: string;
  entityType: string;
  entityDescription: string | null;
  userName: string | null;
  timestamp: string;
};

const iconMap: Record<string, React.ElementType> = {
  AVAILABILITY: Activity,
  PM_COMPLIANCE: ShieldCheck,
  BREAKDOWNS: AlertTriangle,
  OPEN_WOS: ClipboardList,
};

// Full set — filtered per role by canAccessPath so each user sees only what they
// can actually open.
const QUICK_LINKS = [
  { href: "/equipment", label: "Equipment", icon: Layers },
  { href: "/schedule", label: "Annual Plan", icon: Calendar },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList },
  { href: "/wms", label: "WMS", icon: FileText },
  { href: "/permits", label: "Permits (PTW)", icon: ShieldCheck },
  { href: "/corrective", label: "Corrective / RCA", icon: AlertTriangle },
  { href: "/procedure", label: "Procedure", icon: BookText },
  { href: "/kpi", label: "KPI Dashboard", icon: TrendingUp },
  { href: "/oem", label: "OEM & Warranty", icon: Building2 },
  { href: "/calibration", label: "Calibration", icon: Gauge },
  { href: "/training", label: "Training", icon: GraduationCap },
  { href: "/audit/non-conformity", label: "Audit & NC", icon: ShieldAlert },
];

export default function Home() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const firstName = ((session?.user?.name as string) ?? "").split(" ")[0];

  const [stats, setStats] = useState<Stat[]>([]);
  const [equipment, setEquipment] = useState<Equip[]>([]);
  const [activity, setActivity] = useState<Audit[]>([]);
  const [signoffs, setSignoffs] = useState<SignoffItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    Promise.all([
      fetch("/api/dashboard/stats").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/equipment").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/audit").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/signoffs/mine").then((r) => (r.ok ? r.json() : { items: [] })),
    ])
      .then(([s, e, a, m]) => {
        setStats(Array.isArray(s) ? s : []);
        setEquipment(Array.isArray(e) ? e : []);
        setActivity(Array.isArray(a) ? a : []);
        setSignoffs(Array.isArray(m?.items) ? m.items : []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Only show quick links this role can actually open.
  const quickLinks = QUICK_LINKS.filter((q) => canAccessPath(mounted ? role : undefined, q.href));

  const brokenDown = equipment.filter((e) => e.status === "BROKEN_DOWN");
  const critical = equipment
    .filter((e) => e.criticality === "HIGH" || e.criticality === "CRITICAL")
    .sort((a) => (a.status === "BROKEN_DOWN" ? -1 : 1))
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Role-aware greeting */}
        {mounted && session?.user && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                {firstName ? `Welcome, ${firstName}` : "Welcome"}
              </h1>
              <p className="text-xs text-slate-500 font-mono">{ROLE_LABELS[role ?? ""] ?? role ?? ""}</p>
            </div>
          </div>
        )}

        {/* My sign-offs — what's awaiting THIS user's signature, across every module */}
        {signoffs.length > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-emerald-200 flex items-center gap-2">
              <PenLine className="w-4 h-4 text-emerald-700" />
              <h3 className="text-sm font-bold text-emerald-900">Awaiting your sign-off</h3>
              <span className="ml-1 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                {signoffs.length}
              </span>
            </div>
            <div className="divide-y divide-emerald-100">
              {signoffs.map((s) => (
                <Link
                  key={s.stepId}
                  href={s.link}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-emerald-100/40 transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {s.typeLabel}
                      {s.reference ? <span className="font-mono text-slate-500"> · {s.reference}</span> : null}
                    </p>
                    <p className="text-xs text-slate-500">Your step: {s.roleLabel}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 shrink-0">
                    Review &amp; sign <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Breakdown alert (only when something is actually down) */}
        {brokenDown.map((eq) => (
          <div
            key={eq.id}
            className="relative overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 relative z-10">
              <div className="p-2 bg-rose-500/20 text-rose-600 rounded-lg">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <p className="text-sm font-semibold text-rose-700">
                  Critical Breakdown: {eq.name} ({eq.assetId})
                </p>
                <p className="text-xs text-rose-700/80">
                  Status is Broken Down — raise a corrective request and RCA.
                </p>
              </div>
            </div>
            <Link
              href="/corrective/new"
              className="relative z-10 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold whitespace-nowrap"
            >
              Report Corrective Fault
            </Link>
          </div>
        ))}

        {/* Executive stats */}
        {loading ? (
          <div className="py-12 flex justify-center items-center">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="text-xs text-slate-500 ml-2 font-mono">Loading live metrics…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map((stat, i) => {
              const Icon = iconMap[stat.code] || Activity;
              const isDanger = stat.status === "danger";
              const isWarning = stat.status === "warning";
              const colorClass = isDanger ? "text-rose-600" : isWarning ? "text-amber-600" : "text-emerald-600";
              const bgClass = isDanger
                ? "bg-rose-500/5 border-rose-500/15"
                : isWarning
                  ? "bg-amber-500/5 border-amber-500/15"
                  : "bg-emerald-500/5 border-emerald-500/15";
              return (
                <div key={i} className={`p-5 rounded-xl border ${bgClass} backdrop-blur-sm flex flex-col justify-between`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.title}</span>
                    <div className={`p-2 rounded-lg bg-slate-100 ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-bold tracking-tight text-slate-900">{stat.value}</span>
                      <span className="text-xs font-mono text-slate-500">/ {stat.target}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-2 line-clamp-1">{stat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Module quick links (role-aware) */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {quickLinks.map((q) => {
            const Icon = q.icon;
            return (
              <Link
                key={q.href}
                href={q.href}
                className="flex flex-col items-center justify-center p-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded-xl transition-all gap-2 text-center"
              >
                <Icon className="w-5 h-5 text-emerald-600" />
                <span className="text-[11px] font-semibold text-slate-900">{q.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Critical machinery + recent activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-slate-900">Critical Machinery Status</h3>
              <Link href="/equipment" className="text-xs text-emerald-600 hover:underline">View All Assets</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-medium">
                    <th className="py-2">Equipment</th>
                    <th className="py-2">Tag ID</th>
                    <th className="py-2">Location</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Next PM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {critical.map((eq) => (
                    <tr key={eq.id} className="hover:bg-slate-50 text-slate-700">
                      <td className="py-3 font-medium text-slate-900">
                        <Link href={`/equipment/${eq.assetId}`} className="hover:text-emerald-600">{eq.name}</Link>
                      </td>
                      <td className="py-3 font-mono text-slate-500">{eq.assetId}</td>
                      <td className="py-3">{eq.location ?? eq.bay ?? "—"}</td>
                      <td className="py-3">
                        <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
                          {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
                        </Badge>
                      </td>
                      <td className="py-3 font-mono text-slate-500">{formatDate(eq.nextMaintenanceDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-wide text-slate-900">Recent Activity</h3>
              <Link href="/audit/logs" className="text-xs text-emerald-600 hover:underline">Audit Log</Link>
            </div>
            <div className="space-y-4">
              {activity.length === 0 && (
                <p className="text-xs text-slate-500">No recorded activity yet.</p>
              )}
              {activity.slice(0, 6).map((act) => (
                <div key={act.id} className="flex gap-3 text-xs leading-relaxed border-l-2 border-slate-200 pl-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tracking-wider text-[10px] text-emerald-600">{act.action}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{formatDate(act.timestamp)}</span>
                    </div>
                    <p className="font-medium text-slate-900 capitalize">{act.entityType.replace(/_/g, " ")}</p>
                    <p className="text-slate-500 text-[11px]">{act.entityDescription ?? `by ${act.userName ?? "system"}`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-white/90 py-4 px-6 text-center text-[10px] text-slate-500 font-mono">
        &copy; {new Date().getFullYear()} Lee International Machinery and Services Limited · Compliance: ISO 9001:2015, ISO 45001.
      </footer>
    </div>
  );
}
