// src/components/Sidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
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
  ScrollText,
  FileBarChart,
  FolderOpen,
  BookText,
  GraduationCap,
  Users,
  SlidersHorizontal,
  Database,
  Package,
  Siren,
  HardHat,
} from "lucide-react";
import { isSuperAdmin, canAccessPath } from "@/lib/roles";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
type NavSection = { section: string | null; items: NavItem[] };

// Grouped navigation, related modules under a labelled section for clearer
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
      { href: "/spares", label: "Critical Spares", icon: Package },
    ],
  },
  {
    section: "Safety & Compliance",
    items: [
      { href: "/wms", label: "WMS", icon: FileText },
      { href: "/permits", label: "Permits (PTW)", icon: ShieldCheck },
      { href: "/emergency", label: "Emergency Prep", icon: Siren },
      { href: "/contractors", label: "Contractors", icon: HardHat },
      { href: "/audit/non-conformity", label: "Audit & NC", icon: ShieldAlert },
      { href: "/audit/risks", label: "Risk Register", icon: AlertOctagon },
      { href: "/audit/logs", label: "Audit Log", icon: ScrollText },
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


export default function Sidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;

  // The session only resolves on the client, so the role is unknown during SSR
  // and the first client paint. Defer role-based filtering until after mount so
  // the initial render matches the server HTML (avoids a hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const role = mounted ? (user as { role?: string })?.role : undefined;

  // The mobile drawer could only be dismissed by tapping the backdrop, no key
  // closed it, which for a keyboard user is a dead end.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen, onClose]);

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
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        aria-label="Main navigation"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        className={`w-60 shrink-0 h-screen bg-white border-r border-slate-200 flex flex-col z-50
          fixed inset-y-0 left-0 transform transition-transform duration-200 ease-out
          lg:static lg:z-auto lg:translate-x-0 lg:sticky lg:top-0
          ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"}`}
      >
      <Link href="/" onClick={onClose} className="flex items-center gap-2.5 px-5 h-14 border-b border-slate-200 shrink-0">
        <Image
          src="/brand/logo-80.png"
          alt=""
          width={32}
          height={32}
          priority
          className="w-8 h-8 rounded-lg shrink-0"
        />
        <div>
          <h1 className="text-sm font-bold tracking-tight text-slate-900 leading-none">LIMSL CMS</h1>
          <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase mt-0.5">
            Maintenance Portal
          </p>
        </div>
      </Link>

      <nav aria-label="Modules" className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {sections.map((s, si) => (
          <div key={s.section ?? `s-${si}`} className="space-y-0.5">
            {s.section && (
              <p className="px-3 pt-1 pb-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
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
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 min-h-11 lg:min-h-0 lg:py-2 rounded-lg text-sm font-medium transition-all ${
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

      </aside>
    </>
  );
}
