// src/components/Sidebar.tsx
"use client";

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
  FileBarChart,
  FolderOpen,
  Users,
  LogOut,
  User,
} from "lucide-react";
import { ROLE_LABELS, isSuperAdmin } from "@/lib/roles";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/equipment", label: "Equipment", icon: Layers },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList },
  { href: "/corrective", label: "Corrective / RCA", icon: AlertTriangle },
  { href: "/wms", label: "WMS", icon: FileText },
  { href: "/kpi", label: "KPI Dashboard", icon: TrendingUp },
  { href: "/oem", label: "OEM & Warranty", icon: Building2 },
  { href: "/calibration", label: "Calibration", icon: Gauge },
  { href: "/audit/non-conformity", label: "Audit & NC", icon: ShieldAlert },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const user = session?.user;
  const role = (user as { role?: string })?.role;

  // Super Admins get the user-management entry.
  const nav = isSuperAdmin(role)
    ? [...NAV, { href: "/settings/users", label: "Users (Admin)", icon: Users }]
    : NAV;

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

      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">
        {nav.map((item) => {
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
              <Icon className={`w-4 h-4 ${active ? "text-emerald-600" : "text-slate-400"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3 shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 border border-emerald-200 shrink-0">
            <User className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900 truncate">{user?.name ?? "Guest"}</p>
            <p className="text-[9px] font-mono text-emerald-600 uppercase tracking-wider truncate">
              {ROLE_LABELS[role ?? ""] ?? role ?? "—"}
            </p>
          </div>
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
