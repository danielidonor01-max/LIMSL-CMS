// src/app/equipment/[assetId]/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  History,
  Loader2,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  FileText,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import { EQUIPMENT_STATUS_BADGE, EQUIPMENT_STATUS_LABELS } from "@/lib/constants";

const TYPE_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  WORK_ORDER: { icon: ClipboardList, color: "text-sky-600 bg-sky-50 border-sky-200", label: "Work Order" },
  WORK_ORDER_DONE: { icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200", label: "WO Completed" },
  PM_CHECKLIST: { icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200", label: "PM Signed" },
  CORRECTIVE: { icon: AlertTriangle, color: "text-rose-600 bg-rose-50 border-rose-200", label: "Corrective" },
  CORRECTIVE_CLOSED: { icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200", label: "CM Closed" },
  NON_CONFORMITY: { icon: ShieldAlert, color: "text-amber-600 bg-amber-50 border-amber-200", label: "Non-Conformity" },
  SCHEDULE_DONE: { icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200", label: "Scheduled" },
  DOCUMENT: { icon: FileText, color: "text-violet-600 bg-violet-50 border-violet-200", label: "Document" },
};

export default function EquipmentHistoryPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/equipment/${assetId}/history`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!data || data.error) {
    return (
      <div className="p-10 text-center text-slate-500">
        Equipment not found.{" "}
        <Link href="/equipment" className="text-emerald-600 hover:underline">Back to registry</Link>
      </div>
    );
  }

  const eq = data.equipment;
  const events: any[] = data.events ?? [];

  return (
    <div className="p-6 max-w-4xl w-full mx-auto space-y-6">
      <Link href="/equipment" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to registry
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">Maintenance History Log</h2>
            <p className="text-xs text-slate-500 font-mono">
              {eq.name} · {eq.assetId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
            {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
          </Badge>
          <Link href={`/equipment/${assetId}`} className="text-xs text-emerald-600 hover:underline ml-2">
            Digital Twin →
          </Link>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6">
        {events.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
            <Wrench className="w-6 h-6" />
            No recorded history yet for this machine.
          </div>
        ) : (
          <ol className="relative border-l border-slate-200 ml-3 space-y-6">
            {events.map((ev, i) => {
              const meta = TYPE_META[ev.type] ?? {
                icon: Wrench,
                color: "text-slate-600 bg-slate-100 border-slate-200",
                label: ev.type,
              };
              const Icon = meta.icon;
              const inner = (
                <div className="ml-6">
                  <span className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full border ${meta.color}`}>
                    <Icon className="w-3 h-3" />
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">{formatDate(ev.date)}</span>
                    <Badge className={meta.color}>{meta.label}</Badge>
                  </div>
                  <p className="text-sm font-medium text-slate-900 mt-1">{ev.title}</p>
                  {ev.detail && <p className="text-xs text-slate-500">{ev.detail}</p>}
                </div>
              );
              return (
                <li key={i} className="relative">
                  {ev.href ? (
                    <Link href={ev.href} className="block hover:opacity-80">{inner}</Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
