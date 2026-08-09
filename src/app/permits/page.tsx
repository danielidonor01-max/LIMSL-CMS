// src/app/permits/page.tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/api-cache";
import {
  ShieldCheck,
  ShieldAlert,
  PlusCircle,
  Clock,
  User,
  Lock,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { PERMIT_STATUS_LABELS, PERMIT_STATUS_BADGE } from "@/lib/constants";

type Permit = {
  id: string;
  permitNumber: string;
  workDescription: string;
  equipmentName?: string | null;
  assetId?: string | null;
  permitHolderName?: string | null;
  expiryDate?: string | null;
  status: string;
  lotoApplied?: boolean;
  approval?: { total: number; signed: number; complete: boolean };
};

export default function PermitsList() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const canIssue = mounted && PERMIT_ISSUE_ROLES.includes(role ?? "");

  const { data: records, loading } = useApi<Permit[]>("/api/permits", []);

  useEffect(() => setMounted(true), []);

  const awaiting = records.filter((r) => r.status === "PENDING_APPROVAL").length;
  const active = records.filter((r) => r.status === "ACTIVE").length;
  const expired = records.filter((r) => r.status === "EXPIRED").length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
        <PageHeader
          icon={ShieldCheck}
          title="Permits to Work"
          subtitle="Every permit is signed and approved before work begins"
          backHref="/"
          backLabel="Dashboard"
          actions={
            canIssue ? (
              <Button href="/permits/new" icon={PlusCircle}>
                Raise PTW
              </Button>
            ) : undefined
          }
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Stat label="Awaiting Sign-off" value={awaiting} text="text-amber-600" />
          <Stat label="Approved / Active" value={active} text="text-emerald-600" />
          <Stat label="Expired" value={expired} text="text-rose-600" />
          <Stat label="Total Permits" value={records.length} text="text-slate-900" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : records.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No permits raised yet"
              message="A permit to work must be signed and approved before isolation work begins. Raise one against the equipment being worked on."
              actionLabel={canIssue ? "Raise PTW" : undefined}
              actionHref={canIssue ? "/permits/new" : undefined}
            />
          ) : (
            <div className="divide-y divide-slate-200">
              {records.map((rec) => {
                const pending = rec.status === "PENDING_APPROVAL";
                const signed = rec.approval?.signed ?? 0;
                const total = rec.approval?.total ?? 0;
                return (
                  <Link
                    key={rec.id}
                    href={`/permits/${rec.id}`}
                    className="p-5 hover:bg-slate-50 flex items-start justify-between gap-4 transition-colors group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono text-xs text-slate-500 font-semibold">{rec.permitNumber}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${PERMIT_STATUS_BADGE[rec.status] ?? PERMIT_STATUS_BADGE.DRAFT}`}>
                          {PERMIT_STATUS_LABELS[rec.status] ?? rec.status}
                        </span>
                        {rec.lotoApplied && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-sky-700 bg-sky-500/10 border border-sky-500/20 rounded-full px-2 py-0.5">
                            <Lock className="w-3 h-3" /> LOTO
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {rec.assetId ? `${rec.assetId}, ` : ""}
                        {rec.equipmentName || "Equipment"}
                      </h3>
                      <p className="text-xs text-slate-600 max-w-xl line-clamp-1">{rec.workDescription}</p>
                      <div className="flex flex-wrap gap-4 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" /> Holder: {rec.permitHolderName || "-"}
                        </div>
                        {rec.expiryDate && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> Expires{" "}
                            <span className="font-mono">{new Date(rec.expiryDate).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                      {pending && (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 font-semibold">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Work may not begin, {signed}/{total} signatures
                        </div>
                      )}
                      {rec.status === "EXPIRED" && (
                        <div className="flex items-center gap-1.5 text-[11px] text-rose-600 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> Permit window lapsed.
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-900 shrink-0 mt-1" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
      <h2 className={`text-2xl font-bold mt-2 ${text}`}>{value}</h2>
    </div>
  );
}
