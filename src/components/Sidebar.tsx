// src/components/Sidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Wrench,
  LayoutDashboard,
  Layers,
  Calendar,
  ClipboardList,
  AlertTriangle,
  FileText,
  TrendingUp,
  Building2,
  Gauge,
  ShieldAlert,
  ShieldCheck,
  AlertOctagon,
  FileBarChart,
  FolderOpen,
  BookText,
  GraduationCap,
  Users,
  SlidersHorizontal,
  Database,
  LogOut,
  User,
  KeyRound,
} from "lucide-react";
import { ROLE_LABELS, isSuperAdmin, canAccessPath } from "@/lib/roles";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavSection = { section: string | null; items: NavItem[] };

// Grouped navigation — related modules under a labelled section for clearer
// information hierarchy instead of one long flat list.
const NAV_SECTIONS: NavSection[] = [
  { section: null, items: [{ href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
  {
    section: "Assets",
    items: [
      { href: "/equipment", label: "Equipment", icon: Layers },
      { href: "/documents", label: "Documents", icon: FolderOpen },
      { href: "/procedure", label: "Maint. Procedure", icon: BookText },
    ],
  },
  {
    section: "Maintenance",
    items: [
      { href: "/schedule", label: "Schedule", icon: Calendar },
      { href: "/work-orders", label: "Work Orders", icon: ClipboardList },
      { href: "/corrective", label: "Corrective / RCA", icon: AlertTriangle },
    ],
  },
  {
    section: "Safety & Compliance",
    items: [
      { href: "/wms", label: "WMS", icon: FileText },
      { href: "/permits", label: "Permits (PTW)", icon: ShieldCheck },
      { href: "/audit/non-conformity", label: "Audit & NC", icon: ShieldAlert },
      { href: "/audit/risks", label: "Risk Register", icon: AlertOctagon },
    ],
  },
  {
    section: "Performance & Resources",
    items: [
      { href: "/kpi", label: "KPI Dashboard", icon: TrendingUp },
      { href: "/oem", label: "OEM & Warranty", icon: Building2 },
      { href: "/calibration", label: "Calibration", icon: Gauge },
      { href: "/training", label: "Training & Competency", icon: GraduationCap },
      { href: "/reports", label: "Reports", icon: FileBarChart },
    ],
  },
];


export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;

  // The session only resolves on the client, so the role is unknown during SSR
  // and the first client paint. Defer role-based filtering until after mount so
  // the initial render matches the server HTML (avoids a hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = mounted ? (user as { role?: string })?.role : undefined;

  // Filter each section by role, drop empty sections, and append an Admin section
  // for Super Admins.
  const sections: NavSection[] = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => canAccessPath(role, i.href)) }))
    .filter((s) => s.items.length > 0);
  if (isSuperAdmin(role)) {
    sections.push({
      section: "Administration",
      items: [
        { href: "/settings/users", label: "Users", icon: Users },
        { href: "/settings/import", label: "Data Import", icon: Database },
        { href: "/settings", label: "App Settings", icon: SlidersHorizontal, exact: true },
      ],
    });
  }

  const isActive = (item: { href: string; exact?: boolean }) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <aside className="w-60 shrink-0 h-screen sticky top-0 border-r border-slate-200 bg-white flex flex-col">
      <Link href="/" className="flex items-center gap-2.5 px-5 h-14 border-b border-slate-200 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shadow-sm">
          <Wrench className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-none">LIMSL CMS</h1>
          <p className="text-[8px] text-slate-400 font-mono tracking-widest uppercase mt-0.5">
            Maintenance Portal
          </p>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {sections.map((s, si) => (
          <div key={s.section ?? `s-${si}`} className="space-y-0.5">
            {s.section && (
              <p className="px-3 pt-1 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                {s.section}
              </p>
            )}
            {s.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${
                    active
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-emerald-600" : "text-slate-400"}`} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-3 shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-200 shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 truncate">{(mounted && user?.name) || "Guest"}</p>
            <p className="text-[9px] font-mono text-emerald-600 uppercase tracking-wider truncate">
              {ROLE_LABELS[role ?? ""] ?? role ?? "—"}
            </p>
          </div>
          <Link
            href="/change-password"
            title="Change Password"
            className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-all"
          >
            <KeyRound className="w-4 h-4" />
          </Link>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Sign out"
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
