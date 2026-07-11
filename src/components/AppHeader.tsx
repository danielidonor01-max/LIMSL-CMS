// src/components/AppHeader.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wrench,
  LayoutDashboard,
  Layers,
  Calendar,
  ClipboardList,
  TrendingUp,
  Building2,
  Gauge,
  FileBarChart,
  User,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/equipment", label: "Equipment", icon: Layers },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/work-orders", label: "Work Orders", icon: ClipboardList },
  { href: "/kpi", label: "KPIs", icon: TrendingUp },
  { href: "/oem", label: "OEM", icon: Building2 },
  { href: "/calibration", label: "Calibration", icon: Gauge },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];

export default function AppHeader() {
  const pathname = usePathname();

  const isActive = (item: (typeof NAV)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <header className="border-b border-slate-800 bg-[#0f172a]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="px-6 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Wrench className="w-4.5 h-4.5 text-slate-950" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-400 bg-clip-text text-transparent">
              LIMSL CMS
            </h1>
            <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase">
              Maintenance Management Portal
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  active
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 border border-transparent"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden md:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="hidden lg:flex items-center gap-3 border border-slate-800 rounded-full py-1.5 px-3 bg-slate-900/50 shrink-0">
          <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
            <User className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold text-slate-200 leading-tight">Daniel Idonor</p>
            <p className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">System Owner</p>
          </div>
        </div>
      </div>
    </header>
  );
}
