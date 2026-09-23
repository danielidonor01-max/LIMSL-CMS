// src/app/work-orders/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { PAGE_MAIN } from "@/lib/page-shell";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApi, invalidateApi } from "@/lib/api-cache";
import KebabMenu from "@/components/KebabMenu";
import {
  ClipboardList,
  Plus,
  Search,
  Eye,
  PenLine,
  XCircle,
  Play,
  CheckCircle2,
  RotateCcw,
  ClipboardCheck,
  AlertCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import Select from "@/components/Select";
import Button from "@/components/Button";
import Modal from "@/components/Modal";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import TableSkeleton from "@/components/TableSkeleton";
import { formatDate } from "@/lib/utils";
import LoadError from "@/components/LoadError";
import WorkOrderQuickViewModal from "@/components/WorkOrderQuickViewModal";
import WorkOrderQuickSignModal from "@/components/WorkOrderQuickSignModal";
import { canSignStep, MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { toast } from "sonner";
import {
  WO_STATUS_BADGE,
  WO_STATUS_LABELS,
  WO_TYPE_LABELS,
  PRIORITY_LABELS,
} from "@/lib/constants";

type WorkOrder = {
  id: string;
  workOrderNumber: string;
  type: string;
  status: string;
  approvalRetrospective: boolean | null;
  approvedAt: string | null;
  priority: string;
  title: string;
  description?: string | null;
  plannedDate: string | null;
  startDate?: string | null;
  completionDate: string | null;
  actualDuration?: number | null;
  completionNotes?: string | null;
  technicianId?: string | null;
  technicianName: string | null;
  assistantIds?: string | null;
  equipmentId?: string | null;
  scheduleId?: string | null;
  equipmentName: string | null;
  assetId: string | null;
  category: string | null;
  location: string | null;
  chain?: Array<{
    id: string;
    stepOrder: number;
    role: string;
    roleLabel: string;
    status: string;
    signedByName: string | null;
    signedAt: string | null;
    comments: string | null;
  }>;
  nextSignoffStep?: {
    id: string;
    stepOrder: number;
    role: string;
    roleLabel: string;
  } | null;
  rejectedStep?: {
    id: string;
    roleLabel: string;
    comments: string | null;
    signedByName: string | null;
  } | null;
};

export default function WorkOrdersPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // `userRole` was read in four places and declared in none, so this page did
  // not compile and `next build` refused the branch. useSession was already
  // imported for it; only the line that reads the role was missing.
  //
  // The mounted guard is deliberate and is the convention here (AGENTS.md §7):
  // the session resolves client-side only, so deriving anything role-dependent
  // during SSR is a hydration mismatch.
  const { data: session } = useSession();
  const userRole = mounted ? (session?.user as { role?: string })?.role : undefined;
  const canWrite = mounted && MAINTENANCE_WRITE_ROLES.includes(userRole ?? "");

  const { data: rowsData, loading, error, refresh } = useApi<WorkOrder[]>("/api/work-orders", []);
  const rows = Array.isArray(rowsData) ? rowsData : [];
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // Modal states
  const [quickViewWo, setQuickViewWo] = useState<WorkOrder | null>(null);
  const [quickSignWo, setQuickSignWo] = useState<WorkOrder | null>(null);
  const [completeWo, setCompleteWo] = useState<WorkOrder | null>(null);
  const [completeNotes, setCompleteNotes] = useState("");
  const [completeHours, setCompleteHours] = useState("");
  const [completing, setCompleting] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      OPEN: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      PENDING_APPROVAL: 0,
      REJECTED: 0,
      TOTAL: rows.length,
    };
    rows.forEach((r) => (c[r.status] = (c[r.status] ?? 0) + 1));
    return c;
  }, [rows]);

  // One place deciding what a row offers, so the menu cannot drift from the
  // status rules the buttons used to carry inline.
  const rowActions = (r: WorkOrder, canSign: boolean, isPreventive: boolean) => [
    { label: "Quick review", icon: Eye, onClick: () => setQuickViewWo(r) },
    ...(canSign
      ? [
          { label: "Sign approval", icon: PenLine, onClick: () => setQuickSignWo(r) },
          { label: "Return for revision", icon: XCircle, onClick: () => setQuickSignWo(r), danger: true },
        ]
      : []),
    ...(r.status === "OPEN" && canWrite
      ? [{ label: "Start work", icon: Play, onClick: () => handleStartWork(r) }]
      : []),
    ...(r.status === "IN_PROGRESS" && canWrite
      ? isPreventive
        ? [{ label: "Fill PM checklist", icon: ClipboardCheck, href: `/work-orders/${r.id}/pm-checklist` }]
        : [
            {
              label: "Complete work order",
              icon: CheckCircle2,
              onClick: () => {
                setCompleteWo(r);
                setCompleteNotes("");
                setCompleteHours("");
              },
            },
          ]
      : []),
    ...(r.status === "REJECTED" && canWrite
      ? [{ label: "Revise & resubmit", icon: RotateCcw, onClick: () => handleResubmit(r) }]
      : []),
    { label: "Open full record", icon: ExternalLink, href: `/work-orders/${r.id}` },
  ];

  const filtered = useMemo(() => {
    let out = rows;
    if (statusFilter !== "ALL") out = out.filter((r) => r.status === statusFilter);
    if (typeFilter !== "ALL") out = out.filter((r) => r.type === typeFilter);
    if (q.trim()) {
      const t = q.toLowerCase();
      out = out.filter(
        (r) =>
          r.workOrderNumber.toLowerCase().includes(t) ||
          r.title.toLowerCase().includes(t) ||
          r.equipmentName?.toLowerCase().includes(t) ||
          r.assetId?.toLowerCase().includes(t) ||
          r.technicianName?.toLowerCase().includes(t),
      );
    }
    return out;
  }, [rows, statusFilter, typeFilter, q]);

  const filtersActive = q.trim() !== "" || statusFilter !== "ALL" || typeFilter !== "ALL";
  const clearFilters = () => {
    setQ("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
  };

  const handleStartWork = async (wo: WorkOrder) => {
    try {
      const res = await fetch(`/api/work-orders/${wo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Could not start work order.");
        return;
      }
      toast.success(`${wo.workOrderNumber} is now in progress.`);
      invalidateApi("/api/work-orders");
      refresh();
      if (quickViewWo?.id === wo.id) setQuickViewWo(null);
    } catch {
      toast.error("Could not start work order.");
    }
  };

  const handleCompleteSubmit = async () => {
    if (!completeWo) return;
    if (!completeNotes.trim()) {
      toast.error("Describe the work performed before completing.");
      return;
    }
    setCompleting(true);
    try {
      const res = await fetch(`/api/work-orders/${completeWo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "COMPLETED",
          completionNotes: completeNotes.trim(),
          actualDuration: completeHours ? Number(completeHours) : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Could not complete work order.");
        return;
      }
      toast.success(`${completeWo.workOrderNumber} completed and logged to machine history.`);
      invalidateApi("/api/work-orders");
      refresh();
      setCompleteWo(null);
      setCompleteNotes("");
      setCompleteHours("");
      if (quickViewWo?.id === completeWo.id) setQuickViewWo(null);
    } catch {
      toast.error("Could not complete work order.");
    } finally {
      setCompleting(false);
    }
  };

  const handleResubmit = async (wo: WorkOrder) => {
    try {
      const res = await fetch(`/api/work-orders/${wo.id}/resubmit`, {
        method: "POST",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Could not resubmit work order.");
        return;
      }
      toast.success(`${wo.workOrderNumber} sign-off chain reset and resubmitted for approval.`);
      invalidateApi("/api/work-orders");
      refresh();
      if (quickViewWo?.id === wo.id) setQuickViewWo(null);
    } catch {
      toast.error("Could not resubmit work order.");
    }
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.register}>
        <PageHeader
          title="Work Orders"
          subtitle={`${counts.OPEN ?? 0} open · ${counts.IN_PROGRESS ?? 0} in progress · ${counts.PENDING_APPROVAL ?? 0} pending approval · ${counts.COMPLETED ?? 0} completed`}
          actions={
            <Button href="/work-orders/new" icon={Plus}>
              New Work Order
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-ink-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search WO # / equipment / technician…"
              className="pl-8 pr-3 py-1.5 bg-ink-100 border border-ink-200 rounded-lg text-xs text-ink-900 placeholder:text-ink-500 focus:outline-none focus:border-brand-500/40 w-64"
            />
          </div>
          <Select
            ariaLabel="Status"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v)}
          >
            <option value="ALL">All statuses</option>
            {Object.entries(WO_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Select
            ariaLabel="Type"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
          >
            <option value="ALL">All types</option>
            {Object.entries(WO_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>

        <div className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
          {error && !loading ? (
            <LoadError what="work orders" onRetry={refresh} />
          ) : loading ? (
            <TableSkeleton rows={7} cols={8} />
          ) : filtered.length === 0 ? (
            filtersActive ? (
              <EmptyState
                icon={Search}
                title="No work orders match these filters"
                message="There are work orders on file, but none match the current search, status and type."
                actionLabel="Clear filters"
                onAction={clearFilters}
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No work orders yet"
                message="Planned and corrective jobs will appear here once the first work order is raised."
                actionLabel="New Work Order"
                actionHref="/work-orders/new"
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-500 text-xs">
                    <th className="py-2.5 px-4 font-medium">WO #</th>
                    <th className="py-2.5 px-4 font-medium">Equipment</th>
                    <th className="py-2.5 px-4 font-medium">Type</th>
                    <th className="py-2.5 px-4 font-medium">Priority</th>
                    <th className="py-2.5 px-4 font-medium">Planned</th>
                    <th className="py-2.5 px-4 font-medium">Technician</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right min-w-[200px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {filtered.map((r) => {
                    const canSign = !!(r.nextSignoffStep && canSignStep(userRole, r.nextSignoffStep.role));
                    const isPreventive = r.type === "PREVENTIVE" || r.type === "INSPECTION";

                    return (
                      <tr key={r.id} className="hover:bg-ink-50 transition-colors">
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <Link href={`/work-orders/${r.id}`} className="text-brand-600 font-semibold hover:underline">
                            {r.workOrderNumber}
                          </Link>
                        </td>
                        <td className="py-2.5 px-4">
                          <Link href={`/work-orders/${r.id}`} className="block">
                            <div className="font-medium text-ink-900 truncate max-w-[220px]">
                              {r.equipmentName}
                            </div>
                          </Link>
                          {r.assetId && (
                            <Link
                              href={`/equipment/${r.assetId.replace(/\//g, "-")}`}
                              className="text-xs text-ink-500 hover:text-brand-600 hover:underline"
                            >
                              {r.assetId}
                            </Link>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-ink-600 whitespace-nowrap text-xs">
                          {WO_TYPE_LABELS[r.type] ?? r.type}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap text-xs">
                          <span
                            className={
                              r.priority === "CRITICAL" || r.priority === "HIGH"
                                ? "font-bold text-danger-700"
                                : "text-ink-600 font-medium"
                            }
                          >
                            {PRIORITY_LABELS[r.priority] ?? r.priority}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 tabular-nums text-ink-600 whitespace-nowrap text-xs">
                          {formatDate(r.plannedDate)}
                        </td>
                        <td className="py-2.5 px-4 text-ink-700 whitespace-nowrap text-xs">
                          {r.technicianName ?? (
                            <span className="text-ink-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1 items-start">
                            {r.approvalRetrospective && !r.approvedAt && (
                              <Badge className="bg-warn-500/10 text-warn-700 border-warn-500/20 text-xs">
                                Unsigned emergency
                              </Badge>
                            )}
                            <Badge className={WO_STATUS_BADGE[r.status]}>
                              {WO_STATUS_LABELS[r.status] ?? r.status}
                            </Badge>
                            {r.status === "PENDING_APPROVAL" && r.nextSignoffStep && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded-lg font-medium flex items-center gap-1 ${
                                  canSign
                                    ? "bg-brand-500/10 text-brand-700 border border-brand-500/30 animate-pulse font-bold"
                                    : "bg-ink-100 text-ink-500 border border-ink-200"
                                }`}
                              >
                                <Clock className="w-2.5 h-2.5" />
                                {canSign ? "Your Sign-Off Needed" : `Awaiting ${r.nextSignoffStep.roleLabel.split(" ")[0]}`}
                              </span>
                            )}
                            {r.status === "REJECTED" && r.rejectedStep && (
                              <span className="text-xs text-danger-700 flex items-center gap-1">
                                <AlertCircle className="w-2.5 h-2.5" /> Returned for edit
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Actions column.
                            Seven controls of five different weights used to sit
                            in this cell — an icon button, two filled buttons,
                            an outlined one, a tinted one, a link — and which of
                            them appeared depended on the row's status, so the
                            column changed shape line by line and the eye had
                            nowhere to rest. The register and every other table
                            in the app put row actions behind one kebab; this
                            one now does too. */}
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="flex justify-end">
                            <KebabMenu
                              ariaLabel={`Actions for ${r.workOrderNumber}`}
                              items={rowActions(r, canSign, isPreventive)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-xs text-ink-500">
          Showing {filtered.length} of {rows.length} work orders.
        </p>

        {/* Quick Review Modal */}
        {quickViewWo && (
          <WorkOrderQuickViewModal
            open={!!quickViewWo}
            onClose={() => setQuickViewWo(null)}
            workOrder={quickViewWo}
            canSignNext={!!(quickViewWo.nextSignoffStep && canSignStep(userRole, quickViewWo.nextSignoffStep.role))}
            onOpenSign={() => {
              setQuickSignWo(quickViewWo);
              setQuickViewWo(null);
            }}
            onStartWork={() => handleStartWork(quickViewWo)}
            onOpenComplete={() => {
              setCompleteWo(quickViewWo);
              setCompleteNotes("");
              setCompleteHours("");
              setQuickViewWo(null);
            }}
            onResubmit={() => handleResubmit(quickViewWo)}
          />
        )}

        {/* Quick Sign / Reject Modal */}
        {quickSignWo && (
          <WorkOrderQuickSignModal
            open={!!quickSignWo}
            onClose={() => setQuickSignWo(null)}
            workOrderId={quickSignWo.id}
            workOrderNumber={quickSignWo.workOrderNumber}
            workOrderTitle={quickSignWo.title}
            step={quickSignWo.nextSignoffStep ?? null}
            userRole={userRole}
            onSuccess={() => {
              setQuickSignWo(null);
              refresh();
            }}
          />
        )}

        {/* Quick Complete Modal (non-preventive work orders) */}
        {completeWo && (
          <Modal
            open={!!completeWo}
            onClose={() => setCompleteWo(null)}
            title={`Complete ${completeWo.workOrderNumber}`}
            subtitle={completeWo.title}
          >
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-800">
                  Work Performed Summary *
                </label>
                <textarea
                  value={completeNotes}
                  onChange={(e) => setCompleteNotes(e.target.value)}
                  placeholder="Detail the repairs, adjustments, or parts replaced during this job..."
                  rows={4}
                  className="w-full p-2.5 bg-ink-100 border border-ink-200 rounded-lg text-xs text-ink-900 focus:outline-none focus:border-brand-500/40"
                  required
                />
                <p className="text-[11px] text-ink-400">
                  This summary will be permanently logged to the machine's maintenance history.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-ink-800">
                  Labour Duration (Hours, optional)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={completeHours}
                  onChange={(e) => setCompleteHours(e.target.value)}
                  placeholder="e.g. 2.5"
                  className="w-full p-2 bg-ink-100 border border-ink-200 rounded-lg text-xs text-ink-900 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-ink-200">
                <Button variant="ghost" onClick={() => setCompleteWo(null)} disabled={completing}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCompleteSubmit}
                  loading={completing}
                  icon={CheckCircle2}
                >
                  Complete & Log History
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </main>
    </div>
  );
}
