// src/components/QuickActions.tsx
// Top-bar quick-action menu: the common "create" actions, role-aware, in one
// icon. Replaces the dashboard tiles that duplicated the sidebar.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Zap,
  ClipboardList,
  AlertTriangle,
  ShieldCheck,
  FileText,
  Layers,
} from "lucide-react";
import { MAINTENANCE_WRITE_ROLES, PERMIT_ISSUE_ROLES, WMS_WRITE_ROLES } from "@/lib/roles";

const ACTIONS = [
  { href: "/work-orders/new", label: "New Work Order", icon: ClipboardList, roles: MAINTENANCE_WRITE_ROLES },
  { href: "/corrective/new", label: "Report Breakdown / RCA", icon: AlertTriangle, roles: MAINTENANCE_WRITE_ROLES },
  { href: "/permits/new", label: "Raise Permit (PTW)", icon: ShieldCheck, roles: PERMIT_ISSUE_ROLES },
  { href: "/wms/new", label: "Draft WMS", icon: FileText, roles: WMS_WRITE_ROLES },
  { href: "/equipment/new", label: "Add Equipment", icon: Layers, roles: MAINTENANCE_WRITE_ROLES },
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
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!mounted) return null;
  const actions = ACTIONS.filter((a) => a.roles.includes(role ?? ""));
  if (actions.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Quick actions"
        aria-label="Quick actions"
        className={`p-2 rounded-lg transition-all ${
          open ? "bg-emerald-50 text-emerald-600" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
        }`}
      >
        <Zap className="w-5 h-5" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-3 py-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
            Quick actions
          </div>
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              >
                <Icon className="w-4 h-4 text-emerald-600" />
                {a.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
