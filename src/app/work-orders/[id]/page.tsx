// src/app/work-orders/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Loader2,
  Play,
  XCircle,
  ClipboardCheck,
  Wrench,
  Calendar,
  User,
  ShieldCheck,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import {
  WO_STATUS_BADGE,
  WO_STATUS_LABELS,
  WO_TYPE_BADGE,
  WO_TYPE_LABELS,
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  EQUIPMENT_STATUS_BADGE,
  EQUIPMENT_STATUS_LABELS,
} from "@/lib/constants";

type ChecklistItem = { item: string; status: string; remarks?: string };

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [wo, setWo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/work-orders/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWo(d))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const patch = async (body: Record<string, unknown>) => {
    setActing(true);
    await fetch(`/api/work-orders/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, actorName: "Daniel Idonor" }),
    });
    setActing(false);
    load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!wo || wo.error) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
        <AppHeader />
        <div className="p-16 text-center text-slate-500">
          Work order not found.{" "}
          <Link href="/work-orders" className="text-emerald-600 hover:underline">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  const eq = wo.equipment;
  const checklist = wo.checklist;
  const isPreventive = wo.type === "PREVENTIVE" || wo.type === "INSPECTION";
  const canFillChecklist = isPreventive && !checklist && wo.status !== "CANCELLED";

  const parse = (json: string | null): ChecklistItem[] => {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <AppHeader />
      <main className="flex-1 p-6 max-w-5xl w-full mx-auto space-y-6">
        <Link href="/work-orders" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to work orders
        </Link>

        {/* Header card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-lg font-bold text-emerald-600">
                  {wo.workOrderNumber}
                </span>
                <Badge className={WO_TYPE_BADGE[wo.type]}>{WO_TYPE_LABELS[wo.type] ?? wo.type}</Badge>
                <Badge className={PRIORITY_BADGE[wo.priority]}>
                  {PRIORITY_LABELS[wo.priority] ?? wo.priority}
                </Badge>
                <Badge className={WO_STATUS_BADGE[wo.status]}>
                  {WO_STATUS_LABELS[wo.status] ?? wo.status}
                </Badge>
              </div>
              <h2 className="text-xl font-bold tracking-tight mt-2">{wo.title}</h2>
              {wo.description && <p className="text-sm text-slate-500 mt-1">{wo.description}</p>}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2 shrink-0">
              {wo.status === "OPEN" && (
                <button
                  onClick={() => patch({ status: "IN_PROGRESS" })}
                  disabled={acting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold disabled:opacity-60"
                >
                  <Play className="w-4 h-4" /> Start Work
                </button>
              )}
              {canFillChecklist && (wo.status === "OPEN" || wo.status === "IN_PROGRESS") && (
                <Link
                  href={`/work-orders/${id}/pm-checklist`}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                >
                  <ClipboardCheck className="w-4 h-4" /> Fill PM Checklist
                </Link>
              )}
              {wo.status !== "COMPLETED" && wo.status !== "CANCELLED" && (
                <button
                  onClick={() => patch({ status: "CANCELLED" })}
                  disabled={acting}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold disabled:opacity-60"
                >
                  <XCircle className="w-4 h-4" /> Cancel WO
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-200">
            <Meta icon={<Calendar className="w-3.5 h-3.5" />} label="Planned" value={formatDate(wo.plannedDate)} />
            <Meta icon={<Calendar className="w-3.5 h-3.5" />} label="Completed" value={formatDate(wo.completionDate)} />
            <Meta icon={<User className="w-3.5 h-3.5" />} label="Technician" value={wo.technicianName ?? "—"} />
            <Meta
              icon={<Wrench className="w-3.5 h-3.5" />}
              label="Duration"
              value={wo.actualDuration ? `${wo.actualDuration} hrs` : "—"}
            />
          </div>
        </div>

        {/* Equipment card */}
        {eq && (
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-emerald-600" /> Equipment
            </h3>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <Link href={`/equipment/${eq.assetId}`} className="font-medium text-slate-900 hover:text-emerald-600">
                  {eq.name}
                </Link>
                <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                  {eq.assetId} · {eq.location} · {eq.oem ?? "—"}
                </p>
              </div>
              <Badge className={EQUIPMENT_STATUS_BADGE[eq.status]}>
                {EQUIPMENT_STATUS_LABELS[eq.status] ?? eq.status}
              </Badge>
            </div>
          </div>
        )}

        {/* Completed checklist view */}
        {checklist && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" /> PM Checklist — Signed Off
            </h3>

            <div className="flex flex-wrap gap-2">
              <SafetyChip ok={checklist.ptwIssued} label="PTW Issued" />
              <SafetyChip ok={checklist.lotoApplied} label="LOTO Applied" />
              <SafetyChip ok={checklist.ppeWorn} label="PPE Worn" />
              <SafetyChip ok={checklist.areaSafe} label="Area Safe" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ChecklistSection title="Visual & Physical Inspection" items={parse(checklist.visualInspection)} />
              <ChecklistSection title="Functional Tests" items={parse(checklist.functionalTests)} />
              <ChecklistSection title="Lubrication & Consumables" items={parse(checklist.lubrication)} />
              <ChecklistSection title="Electrical Checks" items={parse(checklist.electricalChecks)} />
            </div>

            {checklist.observations && (
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Findings
                </p>
                <p className="text-sm text-slate-700">{checklist.observations}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-200">
              <SignatureView label="Technician" name={checklist.technicianName} sig={checklist.technicianSignature} />
              <SignatureView label="Supervisor" name={checklist.supervisorName} sig={checklist.supervisorSignature} />
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              Signed {formatDate(checklist.signedAt)} · Next PM {formatDate(checklist.nextPMDate)}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-slate-500 text-[10px] uppercase tracking-wider font-semibold">
        {icon} {label}
      </div>
      <p className="text-sm text-slate-900 mt-1">{value}</p>
    </div>
  );
}

function SafetyChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border ${
        ok
          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
          : "bg-slate-500/10 text-slate-500 border-slate-500/20"
      }`}
    >
      {ok ? "✓" : "✕"} {label}
    </span>
  );
}

function ChecklistSection({ title, items }: { title: string; items: ChecklistItem[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</p>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-700">{it.item}</span>
            <span
              className={
                it.status === "OK" || it.status === "PASS"
                  ? "text-emerald-600"
                  : it.status === "NA"
                    ? "text-slate-500"
                    : "text-rose-600"
              }
            >
              {it.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignatureView({ label, name, sig }: { label: string; name: string | null; sig: string | null }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      {sig ? (
        <Image src={sig} alt={`${label} signature`} width={200} height={60} className="h-14 w-auto bg-slate-100 rounded border border-slate-200" unoptimized />
      ) : (
        <div className="h-14 flex items-center text-xs text-slate-500 italic">No signature</div>
      )}
      <p className="text-sm text-slate-900 mt-1">{name ?? "—"}</p>
    </div>
  );
}
