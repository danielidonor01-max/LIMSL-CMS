// src/app/equipment/[assetId]/do/page.tsx
// The screen a QR scan lands on. Scanning a machine's label used to open the
// digital twin — a four-tab, table-heavy, desktop-shaped page — while the
// person holding the phone was standing at the machine with exactly one
// intention. This asks what they came to do and gets out of the way: three
// thumb-sized choices, each already carrying the machine, so reporting a fault
// or starting a PM is two taps instead of six to twelve.
"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Stethoscope,
  ChevronRight,
  Loader2,
  Layers,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { EQUIPMENT_STATUS_BADGE, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";

type Eq = {
  id: string;
  assetId: string;
  name: string;
  status: string;
  location: string | null;
  bay: string | null;
};
type WorkOrder = { id: string; workOrderNumber: string; type: string; status: string; title: string };

export default function MachineActionsPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = use(params);
  const [eq, setEq] = useState<Eq | null>(null);
  const [openWo, setOpenWo] = useState<WorkOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch(`/api/equipment/${assetId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => alive && setEq(d && !d.error ? d : null))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [assetId]);

  // If this machine already has an open job, "Start today's PM" should open THAT
  // job rather than making the technician create a duplicate.
  useEffect(() => {
    if (!eq?.id) return;
    let alive = true;
    fetch("/api/work-orders")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: (WorkOrder & { equipmentId?: string })[]) => {
        if (!alive || !Array.isArray(rows)) return;
        const mine = rows.find(
          (w) => w.equipmentId === eq.id && (w.status === "OPEN" || w.status === "IN_PROGRESS"),
        );
        setOpenWo(mine ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [eq?.id]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!eq) {
    return (
      <div className="p-8 max-w-md mx-auto text-center space-y-3">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="text-sm font-semibold text-slate-900">Machine not found</p>
        <p className="text-xs text-slate-500">
          The code on this label doesn&apos;t match a machine in the register.
        </p>
        <Link href="/equipment" className="text-xs text-emerald-700 hover:underline">
          Open the equipment register
        </Link>
      </div>
    );
  }

  const pmHref = openWo
    ? openWo.type === "PREVENTIVE" || openWo.type === "INSPECTION"
      ? `/work-orders/${openWo.id}/pm-checklist`
      : `/work-orders/${openWo.id}`
    : `/work-orders/new?equipmentId=${eq.id}`;

  const actions = [
    {
      href: `/corrective/new?equipmentId=${eq.id}`,
      icon: AlertTriangle,
      title: "Report a fault",
      desc: "Something is broken, leaking, making a noise or has stopped",
      tone: "rose" as const,
    },
    {
      href: pmHref,
      icon: ClipboardCheck,
      title: openWo ? `Continue ${openWo.workOrderNumber}` : "Start a job",
      desc: openWo ? openWo.title : "Raise a work order for planned work on this machine",
      tone: "emerald" as const,
    },
    {
      href: `/equipment/${assetId}/troubleshoot`,
      icon: Stethoscope,
      title: "Why does it keep failing?",
      desc: "Search past fixes, manuals and the AI assistant",
      tone: "violet" as const,
    },
  ];

  const toneMap = {
    rose: "bg-rose-50 text-rose-600 border-rose-200",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    violet: "bg-violet-50 text-violet-600 border-violet-200",
  };

  return (
    <div className="p-4 sm:p-6 max-w-lg w-full mx-auto space-y-5">
      {/* Which machine you're standing at — confirm before acting. */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-slate-900 truncate">{eq.name}</h1>
            <p className="text-xs font-mono text-slate-500 mt-0.5">{eq.assetId}</p>
          </div>
          <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
            {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
          </Badge>
        </div>
        {(eq.location || eq.bay) && (
          <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            {[eq.location, eq.bay].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <div className="space-y-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link
              key={a.title}
              href={a.href}
              className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl p-4 min-h-[76px] hover:border-emerald-300 hover:shadow-sm active:scale-[0.99] transition-all group"
            >
              <div className={`p-3 rounded-xl border shrink-0 ${toneMap[a.tone]}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-slate-900 leading-tight">{a.title}</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{a.desc}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 shrink-0 transition-colors" />
            </Link>
          );
        })}
      </div>

      <Link
        href={`/equipment/${assetId}`}
        className="flex items-center justify-center gap-2 min-h-11 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <Layers className="w-4 h-4" /> Open the full machine record
      </Link>
    </div>
  );
}
