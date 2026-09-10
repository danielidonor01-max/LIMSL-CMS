// src/app/permits/page.tsx
"use client";

import MetricPanel from "@/components/MetricPanel";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/Badge";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/api-cache";
import {
  ShieldCheck,
  ShieldAlert,
  PlusCircle,
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
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
        <PageHeader
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

        <MetricPanel
          label="Permit status"
          metrics={[
            {
              key: "awaiting",
              label: "Awaiting sign-off",
              count: awaiting,
              value: String(awaiting),
              status: "warning",
              description: "Raised, not yet authorised to start",
            },
            {
              key: "active",
              label: "Approved and active",
              count: active,
              value: String(active),
              status: "plain",
              description: "Work may proceed under these",
            },
            {
              key: "expired",
              label: "Expired",
              count: expired,
              value: String(expired),
              status: "danger",
              description: "Validity ran out before close-out",
            },
            {
              key: "total",
              label: "Total permits",
              count: records.length,
              value: String(records.length),
              status: "plain",
            },
          ]}
        />

        <div className="bg-surface border border-line rounded-2xl shadow-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={4} />
          ) : records.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="No permits raised yet"
              message="No permits raised. A permit must be fully signed before work begins."
              blockedBy={
                canIssue ? { label: "Start with a Job Hazard Analysis", href: "/jha" } : undefined
              }
            />
          ) : (
            <div className="divide-y divide-ink-200">
              {records.map((rec) => {
                const pending = rec.status === "PENDING_APPROVAL";
                const signed = rec.approval?.signed ?? 0;
                const total = rec.approval?.total ?? 0;
                return (
                  <Link
                    key={rec.id}
                    href={`/permits/${rec.id}`}
                    className="p-5 hover:bg-ink-50 flex items-start justify-between gap-4 transition-colors group"
                  >
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-semibold text-ink-900">
                          {rec.equipmentName || "Equipment"}
                        </h3>
                        <Badge className={PERMIT_STATUS_BADGE[rec.status] ?? PERMIT_STATUS_BADGE.DRAFT}>
                          {PERMIT_STATUS_LABELS[rec.status] ?? rec.status}
                        </Badge>
                        {rec.lotoApplied && (
                          <Badge className="bg-info-500/10 text-info-700 border-info-500/20">LOTO</Badge>
                        )}
                      </div>
                      <p className="text-xs text-ink-600 max-w-xl line-clamp-1">{rec.workDescription}</p>
                      <p className="text-xs text-ink-500">
                        <span className="font-mono">{rec.permitNumber}</span>
                        {rec.assetId ? ` · ${rec.assetId}` : ""}
                        {rec.permitHolderName ? ` · ${rec.permitHolderName}` : ""}
                        {rec.expiryDate ? ` · expires ${formatDate(rec.expiryDate)}` : ""}
                      </p>
                      {pending && (
                        <div className="flex items-center gap-1.5 text-xs text-warn-700 font-semibold">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Work may not begin, {signed}/{total} signatures
                        </div>
                      )}
                      {rec.status === "EXPIRED" && (
                        <div className="flex items-center gap-1.5 text-xs text-danger-600 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" /> Permit window lapsed.
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-300 group-hover:text-ink-900 shrink-0 mt-1" />
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
