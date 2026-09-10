// src/components/Sidebar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
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
  Biohazard,
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
  ChevronLeft,
} from "lucide-react";
import { isSuperAdmin, canAccessPath, ROLE_LABELS } from "@/lib/roles";

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
      { href: "/jha", label: "Job Hazard Analysis", icon: Biohazard },
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

  // Read after mount, never during render: the server has no localStorage, and
  // a sidebar that renders one width on the server and another on the client is
  // a hydration mismatch. It opens expanded and narrows if that is the
  // remembered choice.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("limsl:nav-collapsed") === "1");
    } catch {
      // Private windows and locked-down browsers throw on access. The default
      // is expanded, which is the safe way to be wrong.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("limsl:nav-collapsed", next ? "1" : "0");
      } catch {
        // Not remembering is survivable; failing to collapse is not.
      }
      return next;
    });
  };

  // Collapsing is a desktop affordance. On a phone the sidebar is a drawer that
  // is already hidden, and an icon-only rail there would just be a second menu.
  const narrow = collapsed && !mobileOpen;

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
        <div className="fixed inset-0 z-40 bg-ink-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        aria-label="Main navigation"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        className={`${narrow ? "lg:w-16" : "w-60"} w-60 shrink-0 h-screen bg-nav flex flex-col z-50 transition-[width] duration-200
          fixed inset-y-0 left-0 transform transition-transform duration-200 ease-out
          lg:static lg:z-auto lg:translate-x-0 lg:sticky lg:top-0
          ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0"}`}
      >
      <Link
        href="/"
        onClick={onClose}
        title={narrow ? "LIMSL CMS" : undefined}
        aria-label={narrow ? "LIMSL CMS" : undefined}
        className={`flex items-center gap-2.5 h-14 shrink-0 ${
          narrow ? "px-5 lg:px-0 lg:justify-center" : "px-5"
        }`}
      >
        <Image
          src="/brand/logo-80.png"
          alt=""
          width={32}
          height={32}
          priority
          className="w-8 h-8 rounded-lg shrink-0"
        />
        {/* The mark alone identifies the rail. Nothing here shrinks or ellipses
            to fit 64px: a wordmark cut in half is worse than no wordmark. */}
        <div className={narrow ? "lg:hidden" : ""}>
          <h1 className="text-sm font-bold tracking-tight text-white leading-none">LIMSL CMS</h1>
          <p className="text-[11px] text-nav-text font-medium tracking-wide uppercase mt-0.5">
            Maintenance Portal
          </p>
        </div>
      </Link>

      {/* Who is signed in and where. The reference product carries a workspace
          chip here and it is worth borrowing for a different reason: in a system
          where every signature is attributable, the person should be able to see
          whose name is about to go on the record without opening a menu. */}
      {mounted && user?.name && (
        <div
          title={narrow ? `${user.name}, ${ROLE_LABELS[role ?? ""] ?? "LEE International"}` : undefined}
          className={`mx-3 mb-2 flex items-center gap-2.5 rounded-lg bg-nav-raised py-2.5 ${
            narrow ? "px-3 lg:px-0 lg:justify-center" : "px-3"
          }`}
        >
          <span className="w-7 h-7 rounded-md bg-brand-600 text-white grid place-items-center text-xs font-bold shrink-0">
            {String(user.name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")}
          </span>
          {/* sr-only rather than hidden. The rail shows initials, which a
              screen reader announces as "DI", and this chip exists to say whose
              name is about to go on the record. It leaves the layout without
              leaving the accessible tree. */}
          <span className={`min-w-0 ${narrow ? "lg:sr-only" : ""}`}>
            <span className="block text-xs font-semibold text-white truncate leading-tight">
              {user.name}
            </span>
            <span className="block text-[11px] text-nav-label truncate leading-tight mt-0.5">
              {ROLE_LABELS[role ?? ""] ?? "LEE International"}
            </span>
          </span>
        </div>
      )}

      {/* The rail reserves the scroll gutter on both edges. Without it the
          scrollbar eats 10px from the right of a 64px column and every icon
          drops 5px left of the collapse control below them, which reads as a
          crooked column even though nothing is crooked. */}
      <nav
        aria-label="Modules"
        className={`scroll-nav flex-1 overflow-y-auto py-3 space-y-4 ${
          narrow ? "px-3 lg:px-0 lg:[scrollbar-gutter:stable_both-edges]" : "px-3"
        }`}
      >
        {sections.map((s, si) => (
          <div key={s.section ?? `s-${si}`} className="space-y-0.5">
            {/* The section labels stay. The reference product has six
                destinations and can afford a flat list; this one has twenty-odd
                across four departments, and dropping the grouping to match a
                chat app would cost a technician the map. */}
            {s.section &&
              (narrow ? (
                <span className="hidden lg:block mx-3 my-2 h-px bg-nav-line" aria-hidden="true" />
              ) : (
                <p className="px-3 pt-2 pb-1.5 text-[11px] font-semibold text-nav-label uppercase tracking-[0.12em]">
                  {s.section}
                </p>
              ))}
            {s.items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  title={narrow ? item.label : undefined}
                  aria-label={narrow ? item.label : undefined}
                  className={`flex items-center gap-3 min-h-11 lg:min-h-0 lg:py-2 rounded-lg text-sm transition-colors ${
                    narrow ? "lg:justify-center lg:px-0 px-3" : "px-3"
                  } ${
                    active
                      ? "bg-nav-active text-nav-text-active font-semibold"
                      : "text-nav-text font-medium hover:text-white hover:bg-nav-raised"
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? "text-brand-400" : "text-nav-text"}`} />
                  <span className={narrow ? "lg:hidden" : ""}>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <button
        type="button"
        onClick={toggleCollapsed}
        aria-pressed={collapsed}
        title={narrow ? "Expand sidebar" : undefined}
        aria-label={narrow ? "Expand sidebar" : undefined}
        className={`hidden lg:flex items-center gap-2.5 mx-3 mb-3 py-2 rounded-lg text-xs font-medium text-nav-label hover:text-white hover:bg-nav-raised transition-colors ${
          narrow ? "lg:justify-center lg:px-0" : "px-3"
        }`}
      >
        <ChevronLeft className={`w-4 h-4 shrink-0 transition-transform ${collapsed ? "rotate-180" : ""}`} />
        {!narrow && "Collapse sidebar"}
      </button>

      </aside>
    </>
  );
}
