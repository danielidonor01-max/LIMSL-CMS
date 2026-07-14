// src/app/permits/[id]/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Lock,
  User,
  Clock,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import SignoffChain from "@/components/SignoffChain";
import { useSession } from "next-auth/react";
import { PERMIT_WRITE_ROLES } from "@/lib/roles";
import { toast } from "sonner";

type Permit = {
  id: string;
  permitNumber: string;
  workOrderId: string | null;
  workDescription: string;
  hazardsIdentified: string | null;
  controlMeasures: string | null;
  ppeRequired: string | null;
  lotoApplied: boolean | null;
  areaBarricaded: boolean | null;
  permitHolderName: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  approvedAt: string | null;
  status: string;
  equipment: { name: string; assetId: string; location: string | null } | null;
  closeout: { total: number; signed: number; complete: boolean } | null;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  ACTIVE: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  CLOSED: "bg-slate-200 text-slate-600 border-slate-300",
  CANCELLED: "bg-slate-200 text-slate-500 border-slate-300",
  EXPIRED: "bg-rose-500/10 text-rose-700 border-rose-500/20",
};

function safeParse(v: string | null): string[] {
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.map((x) => (typeof x === "string" ? x : String(x))) : [];
  } catch {
    return [];
  }
}

export default function PermitDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && PERMIT_WRITE_ROLES.includes(role ?? "");

  const [permit, setPermit] = useState<Permit | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/permits/${id}`);
    if (res.ok) setPermit(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    setMounted(true);
    load();
  }, [load]);

  async function cancelPermit() {
    const res = await fetch(`/api/permits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    if (res.ok) {
      toast.success("Permit cancelled.");
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error || "Failed to cancel permit.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!permit) {
    return (
      <div className="p-10 text-center text-slate-500">
        Permit not found. <Link href="/permits" className="text-emerald-600 hover:underline">Back to permits</Link>
      </div>
    );
  }

  const ppe = safeParse(permit.ppeRequired);
  const isActive = permit.status === "ACTIVE";
  const isPending = permit.status === "PENDING_APPROVAL";
  const isDead = permit.status === "CLOSED" || permit.status === "CANCELLED" || permit.status === "EXPIRED";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <main className="flex-1 p-6 max-w-4xl w-full mx-auto space-y-6">
        <div className="no-print">
          <Link href="/permits" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-3.5 h-3.5" /> All permits
          </Link>
        </div>

        {/* The headline: may work begin or not? */}
        {isPending && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Work may NOT begin</p>
              <p className="text-xs mt-0.5">
                This permit is awaiting sign-off. All four signatures are required before the work party may start.
              </p>
            </div>
          </div>
        )}
        {isActive && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Approved — work is authorised</p>
              <p className="text-xs mt-0.5">
                Fully signed{permit.approvedAt ? ` on ${new Date(permit.approvedAt).toLocaleString()}` : ""}. Sign the
                close-out below when the job is complete.
              </p>
            </div>
          </div>
        )}
        {permit.status === "EXPIRED" && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-rose-300 bg-rose-50 text-rose-900">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Permit expired</p>
              <p className="text-xs mt-0.5">The permit window lapsed. Raise a new permit before resuming work.</p>
            </div>
          </div>
        )}

        {/* Permit header */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-sm font-bold text-slate-900">{permit.permitNumber}</span>
                <Badge className={STATUS_BADGE[permit.status]}>{permit.status.replace("_", " ")}</Badge>
                {permit.lotoApplied && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-700 bg-sky-500/10 border border-sky-500/20 rounded-full px-2 py-0.5">
                    <Lock className="w-3 h-3" /> LOTO
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold tracking-tight mt-2">
                {permit.equipment?.assetId} — {permit.equipment?.name}
              </h2>
            </div>
            <div className="flex flex-col gap-2 shrink-0 no-print">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              {canWrite && !isDead && (
                <button
                  onClick={cancelPermit}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-semibold"
                >
                  <XCircle className="w-4 h-4" /> Cancel Permit
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-slate-200">
            <Meta icon={<User className="w-3.5 h-3.5" />} label="Permit Holder" value={permit.permitHolderName ?? "—"} strong />
            <Meta
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Expires"
              value={permit.expiryDate ? new Date(permit.expiryDate).toLocaleString() : "—"}
            />
            <Meta
              icon={<CheckCircle2 className="w-3.5 h-3.5" />}
              label="Work Order"
              value={permit.workOrderId ? "Linked" : "Standalone"}
            />
          </div>

          <Section title="Work Description">{permit.workDescription}</Section>
          {permit.hazardsIdentified && <Section title="Hazards Identified">{permit.hazardsIdentified}</Section>}
          {permit.controlMeasures && <Section title="Control Measures">{permit.controlMeasures}</Section>}

          {ppe.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Required PPE</h3>
              <div className="flex flex-wrap gap-2">
                {ppe.map((p) => (
                  <span key={p} className="px-2 py-1 rounded-md bg-slate-100 border border-slate-200 text-[11px] text-slate-700 capitalize">
                    {p.replace(/([A-Z])/g, " $1")}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Authorisation chain — must be complete before work begins */}
        <SignoffChain
          entityType="PERMIT"
          entityId={permit.id}
          title="Permit Authorisation — required before work begins"
        />

        {/* Close-out chain — only exists once the permit is approved */}
        {permit.closeout && (
          <SignoffChain
            entityType="PERMIT_CLOSEOUT"
            entityId={permit.id}
            title="Close-out — work complete & isolation removed"
          />
        )}
      </main>
    </div>
  );
}

function Meta({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 uppercase tracking-wider">
        {icon} {label}
      </div>
      <p className={`mt-1 text-sm ${strong ? "font-bold text-slate-900" : "text-slate-700"}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{title}</h3>
      <p className="text-sm text-slate-700 whitespace-pre-wrap">{children}</p>
    </div>
  );
}
