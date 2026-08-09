// src/components/QuickActions.tsx
// The app's primary "create" affordance in the top bar, role-aware.
//
// It used to be an icon-only ⚡ button with the same visual weight as the
// notification bell, a primary action and a passive indicator rendered
// identically. Worse, a lightning bolt is genuinely ambiguous in THIS product:
// the app is full of electrical panels, earthing systems and ELECTRICAL fault
// types, so the icon reads as a domain object rather than as "create". It is
// now a labelled "New" button, which is the convention every user already
// knows, and it is the only element in the bar carrying primary weight.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Plus,
  ChevronDown,
  ClipboardList,
  AlertTriangle,
  ShieldCheck,
  FileText,
  Layers,
} from "lucide-react";
import { MAINTENANCE_WRITE_ROLES, PERMIT_ISSUE_ROLES, WMS_WRITE_ROLES } from "@/lib/roles";

const ACTIONS = [
  { href: "/work-orders/new", label: "Work order", icon: ClipboardList, roles: MAINTENANCE_WRITE_ROLES },
  { href: "/corrective/new", label: "Fault report", icon: AlertTriangle, roles: MAINTENANCE_WRITE_ROLES },
  { href: "/permits/new", label: "Permit to work", icon: ShieldCheck, roles: PERMIT_ISSUE_ROLES },
  { href: "/wms/new", label: "Work method statement", icon: FileText, roles: WMS_WRITE_ROLES },
  { href: "/equipment/new", label: "Asset", icon: Layers, roles: MAINTENANCE_WRITE_ROLES },
];

export default function QuickActions() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const role = (session?.user as { role?: string })?.role;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!mounted) return null;
  const actions = ACTIONS.filter((a) => a.roles.includes(role ?? ""));
  if (actions.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 pl-3 pr-2 min-h-10 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition-colors"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">New</span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-80 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Create"
          className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
        >
          <div className="px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-100">
            Create
          </div>
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 min-h-11 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              >
                <Icon className="w-4 h-4 text-emerald-600 shrink-0" />
                {a.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
