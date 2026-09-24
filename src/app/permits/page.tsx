// src/app/permits/page.tsx
// The permit register.
//
// This was a stack of cards, which reads well for three permits and not at all
// for a year of them. A permit register is something an auditor arrives and
// asks to see: which permits are open right now, which have been closed, and
// on what dates. That is a table, split by open and closed, with the dates in
// columns you can run an eye down — so that is what it is now.
"use client";

import MetricPanel from "@/components/MetricPanel";
import { PAGE_MAIN } from "@/lib/page-shell";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/Badge";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi } from "@/lib/api-cache";
import { ShieldCheck, ShieldAlert, PlusCircle, AlertTriangle, Clock, Layers } from "lucide-react";
import Button from "@/components/Button";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import SegmentedControl from "@/components/SegmentedControl";
import { PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { PERMIT_STATUS_LABELS, PERMIT_STATUS_BADGE } from "@/lib/constants";
import { remainingLabel, DEFAULT_PERMIT_VALIDITY_DAYS } from "@/lib/hse/permit-validity";

type Permit = {
  id: string;
  permitNumber: string;
  workDescription: string;
  equipmentName?: string | null;
  assetId?: string | null;
  permitHolderName?: string | null;
  createdAt?: string | null;
  expiryDate?: string | null;
  startDate?: string | null;
  closedAt?: string | null;
  validityDays?: number | null;
  status: string;
  lotoApplied?: boolean;
  batchNumber?: string | null;
  batchTitle?: string | null;
  coveredMachines?: number;
  approval?: { total: number; signed: number; complete: boolean };
};

// A permit is closed when it has been handed back, or when it will never be
// used. Everything else is still out there, which includes an expired permit
// nobody closed — that is the one an auditor asks about first.
const CLOSED_STATES = new Set(["CLOSED", "CLOSED_LATE", "CLOSED_WORK_ONGOING", "CANCELLED"]);

const REMAINING_TONE: Record<string, string> = {
  OK: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  SOON: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  LAST_DAY: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  EXPIRED: "bg-danger-600 text-white border-danger-700",
};

function RemainingBadge({ startDate, validityDays }: { startDate: string; validityDays?: number | null }) {
  const r = remainingLabel(
    startDate,
    validityDays ?? DEFAULT_PERMIT_VALIDITY_DAYS,
    new Date().toISOString().slice(0, 10),
  );
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border w-fit ${REMAINING_TONE[r.tone]}`}
    >
      <Clock className="w-3 h-3" /> {r.label}
    </span>
  );
}

type Scope = "OPEN" | "CLOSED" | "ALL";

export default function PermitsList() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [scope, setScope] = useState<Scope>("OPEN");
  const role = (session?.user as { role?: string })?.role;
  const canIssue = mounted && PERMIT_ISSUE_ROLES.includes(role ?? "");

  const { data: records, loading } = useApi<Permit[]>("/api/permits", []);

  useEffect(() => setMounted(true), []);

  const open = useMemo(() => records.filter((r) => !CLOSED_STATES.has(r.status)), [records]);
  const closed = useMemo(() => records.filter((r) => CLOSED_STATES.has(r.status)), [records]);
  const rows = scope === "OPEN" ? open : scope === "CLOSED" ? closed : records;

  const awaiting = records.filter((r) => r.status === "PENDING_APPROVAL").length;
  const active = records.filter((r) => r.status === "ACTIVE").length;
  const expired = records.filter((r) => r.status === "EXPIRED").length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
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
              key: "closed",
              label: "Closed",
              count: closed.length,
              value: String(closed.length),
              status: "plain",
              description: "Handed back and signed off",
            },
          ]}
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SegmentedControl
            ariaLabel="Permit register scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: "OPEN", label: "Open", count: open.length },
              { value: "CLOSED", label: "Closed", count: closed.length },
              { value: "ALL", label: "All", count: records.length },
            ]}
          />
        </div>

        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title={
                records.length === 0
                  ? "No permits raised yet"
                  : scope === "OPEN"
                    ? "No permits are open"
                    : "No permits have been closed"
              }
              message={
                records.length === 0
                  ? "No permits raised. A permit must be fully signed before work begins."
                  : scope === "OPEN"
                    ? "Every permit on the register has been closed out."
                    : "Nothing has been handed back and closed yet."
              }
              blockedBy={
                records.length === 0 && canIssue
                  ? { label: "Start with a Job Hazard Analysis", href: "/jha" }
                  : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-500 text-xs">
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Permit #</th>
                    <th className="py-2.5 px-4 font-medium">Covers</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Holder</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Raised</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Expires</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Closed</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {rows.map((rec) => {
                    const pending = rec.status === "PENDING_APPROVAL";
                    const signed = rec.approval?.signed ?? 0;
                    const total = rec.approval?.total ?? 0;
                    const covers = rec.batchNumber
                      ? `${rec.batchTitle ?? rec.batchNumber}`
                      : rec.equipmentName || "Equipment";
                    return (
                      <tr key={rec.id} className="hover:bg-ink-50 transition-colors align-top">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Link
                            href={`/permits/${rec.id}`}
                            className="font-semibold text-ink-900 hover:text-brand-700"
                          >
                            {rec.permitNumber}
                          </Link>
                          {rec.lotoApplied && (
                            <Badge className="ml-2 bg-info-500/10 text-info-700 border-info-500/20">
                              LOTO
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {rec.batchNumber && <Layers className="w-3.5 h-3.5 text-ink-400 shrink-0" />}
                            <span className="text-ink-900 truncate">{covers}</span>
                          </div>
                          <p className="text-xs text-ink-500 line-clamp-1">
                            {rec.batchNumber
                              ? `${rec.coveredMachines ?? 0} machine${(rec.coveredMachines ?? 0) === 1 ? "" : "s"} · ${rec.batchNumber}`
                              : rec.assetId || rec.workDescription}
                          </p>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-ink-700">
                          {rec.permitHolderName || "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-ink-600 tabular-nums">
                          {rec.createdAt ? formatDate(rec.createdAt) : "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-ink-600 tabular-nums">
                          {rec.expiryDate ? formatDate(rec.expiryDate) : "—"}
                          {rec.status === "ACTIVE" && rec.startDate ? (
                            <div className="mt-1">
                              <RemainingBadge startDate={rec.startDate} validityDays={rec.validityDays} />
                            </div>
                          ) : null}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-ink-600 tabular-nums">
                          {rec.closedAt ? formatDate(rec.closedAt) : "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge className={PERMIT_STATUS_BADGE[rec.status] ?? PERMIT_STATUS_BADGE.DRAFT}>
                            {PERMIT_STATUS_LABELS[rec.status] ?? rec.status}
                          </Badge>
                          {pending && (
                            <div className="flex items-center gap-1 text-xs text-warn-700 font-semibold mt-1">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              {signed}/{total} signed
                            </div>
                          )}
                          {rec.status === "EXPIRED" && (
                            <div className="flex items-center gap-1 text-xs text-danger-600 font-semibold mt-1">
                              <AlertTriangle className="w-3.5 h-3.5" /> Not closed
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
