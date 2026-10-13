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
import { ShieldCheck, ShieldAlert, PlusCircle, AlertTriangle, Clock, Layers, MapPin } from "lucide-react";
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
  location?: string | null;
  facility?: string | null;
  workArea?: string | null;
  daysRemaining?: number | null;
  daysOverdue?: number | null;
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

type Scope = "OPEN" | "OVERDUE" | "EXPIRING_SOON" | "CLOSED" | "ALL";

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
  const overdue = useMemo(
    () => open.filter((r) => r.status === "EXPIRED" || (r.daysOverdue ?? 0) > 0),
    [open],
  );
  const expiringSoon = useMemo(
    () => open.filter((r) => r.status === "ACTIVE" && (r.daysRemaining ?? 99) <= 2 && (r.daysOverdue ?? 0) === 0),
    [open],
  );

  const rows = useMemo(() => {
    switch (scope) {
      case "OVERDUE":
        return overdue;
      case "EXPIRING_SOON":
        return expiringSoon;
      case "CLOSED":
        return closed;
      case "ALL":
        return records;
      case "OPEN":
      default:
        return open;
    }
  }, [scope, open, closed, overdue, expiringSoon, records]);

  const awaiting = records.filter((r) => r.status === "PENDING_APPROVAL").length;
  const active = records.filter((r) => r.status === "ACTIVE").length;
  const expired = records.filter((r) => r.status === "EXPIRED" || (r.daysOverdue ?? 0) > 0).length;

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Permits to Work"
          subtitle="Track open and closed PTWs, trace where they belong, and monitor days to closure or overdue"
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
          label="Permit lifecycle & safety tracking"
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
              description: "Work proceeding under controls",
            },
            {
              key: "overdue",
              label: "Overdue for closure",
              count: overdue.length,
              value: String(overdue.length),
              status: overdue.length > 0 ? "danger" : "plain",
              icon: AlertTriangle,
              description: "Past validity without formal handback",
            },
            {
              key: "closed",
              label: "Closed & de-isolated",
              count: closed.length,
              value: String(closed.length),
              status: "plain",
              description: "Handed back with HSE sign-off",
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
              { value: "OVERDUE", label: "Overdue", count: overdue.length },
              { value: "EXPIRING_SOON", label: "Expiring Soon", count: expiringSoon.length },
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
                  : scope === "OVERDUE"
                    ? "No overdue permits"
                    : scope === "EXPIRING_SOON"
                      ? "No permits approaching expiry"
                      : scope === "OPEN"
                        ? "No permits are open"
                        : "No permits have been closed"
              }
              message={
                records.length === 0
                  ? "No permits raised. A permit must be fully signed before work begins."
                  : scope === "OVERDUE"
                    ? "All active permits are currently within their authorized validity window."
                    : scope === "EXPIRING_SOON"
                      ? "No active permits are due for closure in the next 48 hours."
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
                    <th className="py-2.5 px-4 font-medium">Where It Belongs & Covers</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Permit Holder</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Authorized Window</th>
                    <th className="py-2.5 px-4 font-medium whitespace-nowrap">Closure Horizon / Days</th>
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
                    const isClosed = CLOSED_STATES.has(rec.status);
                    const isOverdue = !isClosed && (rec.status === "EXPIRED" || (rec.daysOverdue ?? 0) > 0);

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
                            <span className="font-medium text-ink-900 truncate">{covers}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-xs text-ink-500">
                            {rec.assetId && <span>{rec.assetId}</span>}
                            {(rec.location || rec.workArea) && (
                              <span className="inline-flex items-center gap-1 text-ink-600 font-medium">
                                <MapPin className="w-3 h-3 text-brand-600 shrink-0" />
                                {rec.location || rec.workArea} {rec.facility ? `· ${rec.facility}` : ""}
                              </span>
                            )}
                          </div>
                          {rec.workDescription && (
                            <p className="text-xs text-ink-500 line-clamp-1 mt-0.5">
                              {rec.workDescription}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-ink-700">
                          {rec.permitHolderName || "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-xs text-ink-600 tabular-nums">
                          <div>Start: {rec.startDate ? formatDate(rec.startDate) : rec.createdAt ? formatDate(rec.createdAt) : "—"}</div>
                          <div>Expiry: {rec.expiryDate ? formatDate(rec.expiryDate) : "—"}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {isClosed ? (
                            <span className="text-xs text-ink-500 tabular-nums">
                              Closed {rec.closedAt ? formatDate(rec.closedAt) : ""}
                            </span>
                          ) : isOverdue ? (
                            <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-danger-500/10 text-danger-700 border-danger-500/20">
                              <AlertTriangle className="w-3 h-3 text-danger-600 shrink-0" />
                              Overdue by {rec.daysOverdue ?? 1}d
                            </div>
                          ) : rec.status === "ACTIVE" ? (
                            <div className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-brand-500/10 text-brand-700 border-brand-500/20">
                              <Clock className="w-3 h-3 text-brand-600 shrink-0" />
                              {rec.daysRemaining === 0 ? "Expires today" : `${rec.daysRemaining}d to closure`}
                            </div>
                          ) : (
                            <span className="text-xs text-ink-400">Awaiting authorization</span>
                          )}
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
                          {isOverdue && (
                            <div className="text-[11px] text-danger-600 font-medium mt-0.5">
                              Requires de-isolation & handback
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
