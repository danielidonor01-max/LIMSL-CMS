// src/app/pm-batches/[id]/page.tsx
// One PM batch, and the single screen that runs it.
//
// Everything about a planned job used to be spread across four modules with no
// thread between them. Here the machines, the person carrying them, the three
// safety documents and the next thing that has to happen are on one page, in
// the order they happen, because that order is the whole control.
"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { PAGE_MAIN } from "@/lib/page-shell";
import { formatDate } from "@/lib/utils";
import { useApi } from "@/lib/api-cache";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { Badge } from "@/components/Badge";
import FlowRail, { type FlowLink } from "@/components/FlowRail";
import TableSkeleton from "@/components/TableSkeleton";
import { WORK_ASSIGN_ROLES, WORK_ORDER_ASSIGNEE_ROLES, JHA_WRITE_ROLES, PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { WO_STATUS_LABELS, WO_STATUS_BADGE } from "@/lib/constants";
import type { FlowState } from "@/lib/maintenance/flow";
import {
  UserCheck,
  CheckCircle2,
  Clock,
  ClipboardCheck,
  FileText,
  AlertTriangle,
} from "lucide-react";

type BatchWo = {
  id: string;
  workOrderNumber: string;
  equipmentId?: string | null;
  title: string;
  status: string;
  assetId?: string | null;
  machineName?: string | null;
  location?: string | null;
  technicianName?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  checklist?: {
    completed: boolean;
    observations?: string | null;
    correctiveActionRequired: boolean;
    actionDescription?: string | null;
    signedAt?: string | null;
    technicianName?: string | null;
  } | null;
};

type Batch = {
  id: string;
  batchNumber: string;
  title: string;
  categoryLabel: string;
  plannedDate: string;
  status: string;
  assignedToId?: string | null;
  assignedToName?: string | null;
  assignedByName?: string | null;
  assignedAt?: string | null;
  workOrders: BatchWo[];
  wms: { id: string; wmsNumber: string; status: string; revision?: number | null } | null;
  jha: { id: string; jhaNumber: string; status: string; revision?: number | null } | null;
  previousJha: { id: string; jhaNumber: string; wmsRevision?: number | null } | null;
  permit: { id: string; permitNumber: string; status: string } | null;
  flow: FlowState;
};

export default function PmBatchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role ?? null;

  const { data: batch, loading, refresh } = useApi<Batch | null>(`/api/pm-batches/${id}`, null);
  const { data: staff } = useApi<{ id: string; name: string; role: string }[]>("/api/users", []);

  const [assignOpen, setAssignOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => setMounted(true), []);

  const canAssign = mounted && WORK_ASSIGN_ROLES.includes(role ?? "");
  const canCreateJha = mounted && JHA_WRITE_ROLES.includes(role ?? "");
  const canIssuePermit = mounted && PERMIT_ISSUE_ROLES.includes(role ?? "");

  // A job is done by the people who hold the tools, so the list offers exactly
  // those and nobody else.
  const assignees = useMemo(
    () => staff.filter((u) => WORK_ORDER_ASSIGNEE_ROLES.includes(u.role)),
    [staff],
  );

  const assign = async () => {
    if (!person) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pm-batches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId: person }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "Could not assign the batch.");
        return;
      }
      const name = assignees.find((a) => a.id === person)?.name ?? "them";
      toast.success(
        `Assigned to ${name}. Every machine in the batch is now on their list, and they have been told.`,
      );
      setAssignOpen(false);
      setPerson("");
      refresh();
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <main className={PAGE_MAIN.detail}>
          <TableSkeleton rows={6} cols={3} />
        </main>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="min-h-screen bg-canvas">
        <main className={PAGE_MAIN.detail}>
          <PageHeader title="PM batch not found" backHref="/pm-batches" backLabel="PM Batches" />
        </main>
      </div>
    );
  }

  const links: Record<string, FlowLink> = {
    BATCH: { ref: batch.batchNumber },
    ASSIGN: batch.assignedToName
      ? { ref: batch.assignedToName }
      : { onAction: () => setAssignOpen(true), actionLabel: "Assign this batch" },
    WORK_ORDER: {
      ref: `${batch.workOrders.length} raised`,
    },
    // The method statement belongs to the category and is reused cycle after
    // cycle, so an approved one is simply done here — nobody is asked to write
    // it again because the month changed. Its revision is shown so a reader can
    // tell which version of the method this job runs under.
    WMS: batch.wms
      ? {
          ref: `${batch.wms.wmsNumber} · rev ${batch.wms.revision ?? 0}`,
          href: `/wms/${batch.wms.id}`,
          waitingOn:
            batch.wms.status !== "APPROVED"
              ? `${batch.wms.wmsNumber} is written but not approved yet. It needs its signatures before HSE can build the hazard analysis.`
              : undefined,
        }
      : { actionHref: `/wms/new?batchId=${batch.id}` },

    // The analysis is also standing, and tied to the method's revision. When a
    // machine joined the category and the method was revised, the old analysis
    // was retired with it — so the next one is a REVISION of that one, and the
    // form is told which one it replaces.
    JHA: batch.jha
      ? {
          ref: `${batch.jha.jhaNumber} · rev ${batch.jha.revision ?? 0}`,
          href: `/jha/${batch.jha.id}`,
          waitingOn:
            batch.jha.status !== "APPROVED"
              ? `${batch.jha.jhaNumber} is raised but not approved yet. A permit cannot be issued against it until it is.`
              : undefined,
        }
      : batch.wms?.status === "APPROVED"
        ? canCreateJha
          ? batch.previousJha
            ? {
                actionHref: `/jha/new?wmsId=${batch.wms.id}&supersedes=${batch.previousJha.id}`,
                actionLabel: "Revise the JHA",
              }
            : { actionHref: `/jha/new?wmsId=${batch.wms.id}` }
          : { waitingOn: "Waiting on HSE to raise the Job Hazard Analysis for this batch." }
        : { waitingOn: "The method statement has to be approved first." },

    // The permit IS per cycle, so it is raised for this batch by name. The
    // server takes this batch's own work order from it.
    PERMIT: batch.permit
      ? { ref: batch.permit.permitNumber, href: `/permits/${batch.permit.id}` }
      : batch.jha?.status === "APPROVED"
        ? canIssuePermit
          ? { actionHref: `/permits/new?jhaId=${batch.jha.id}&batchId=${batch.id}` }
          : { waitingOn: "Waiting on HSE to issue the Permit to Work for this batch." }
        : { waitingOn: "The hazard analysis has to be approved first." },
    WORK: {
      waitingOn: batch.permit
        ? undefined
        : "No permit, no PM. Work cannot start until the permit is raised.",
      actionLabel: "Complete each machine's checklist from its work order below.",
    },
  };

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.detail}>
        <PageHeader
          title={batch.batchNumber}
          subtitle={`${batch.categoryLabel} · planned ${formatDate(batch.plannedDate)} · ${batch.workOrders.length} machine${batch.workOrders.length === 1 ? "" : "s"}`}
          backHref="/pm-batches"
          backLabel="PM Batches"
        />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
          <div className="space-y-5 min-w-0">
            {/* Who is carrying it */}
            <section className="bg-surface border border-line rounded-xl shadow-card p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 min-w-0">
                  <UserCheck className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-900">
                      {batch.assignedToName ?? "Nobody is assigned yet"}
                    </p>
                    <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
                      {batch.assignedToName
                        ? `Assigned by ${batch.assignedByName ?? "—"}${batch.assignedAt ? ` on ${formatDate(batch.assignedAt)}` : ""}. Every machine in this batch is on their list.`
                        : "Assigning one person here assigns the maintenance activity for every machine in the batch."}
                    </p>
                  </div>
                </div>
                {canAssign && !assignOpen && (
                  <Button size="sm" variant="secondary" onClick={() => setAssignOpen(true)}>
                    {batch.assignedToName ? "Reassign" : "Assign"}
                  </Button>
                )}
              </div>

              {assignOpen && canAssign && (
                <div className="mt-3 pt-3 border-t border-ink-200 flex flex-wrap items-end gap-2">
                  <div className="min-w-[220px] flex-1">
                    <label className="text-xs font-medium text-ink-700 block mb-1" htmlFor="batch-assignee">
                      Assign to
                    </label>
                    <Select value={person} onChange={setPerson} ariaLabel="Assignee" className="w-full">
                      <option value="">Choose a person</option>
                      {assignees.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button size="sm" loading={saving} disabled={!person} onClick={assign}>
                    Assign batch
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAssignOpen(false);
                      setPerson("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </section>

            {/* The machines, which is what the batch actually is */}
            {/* The machines, which is what the batch actually is */}
            <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <header className="px-4 py-3 border-b border-line flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-sm font-semibold text-ink-900">
                    Machines in this batch to work on
                  </h2>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Select an equipment from the list below to conduct its PM checklist. The WMS, JHA, and PTW cover all equipment in this schedule.
                  </p>
                </div>
                <Badge className="bg-ink-100 text-ink-700">
                  {batch.workOrders.filter((w) => w.status === "COMPLETED").length} of {batch.workOrders.length} Completed
                </Badge>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink-500 text-xs">
                      <th className="py-2.5 px-4 font-medium whitespace-nowrap">WO #</th>
                      <th className="py-2.5 px-4 font-medium">Machine & Asset</th>
                      <th className="py-2.5 px-4 font-medium whitespace-nowrap">Status</th>
                      <th className="py-2.5 px-4 font-medium text-right">Checklist Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {batch.workOrders.map((w) => {
                      const isComplete = w.status === "COMPLETED" || Boolean(w.checklist?.completed);
                      return (
                        <tr key={w.id} className="hover:bg-ink-50 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <Link
                              href={`/work-orders/${w.id}`}
                              className="font-semibold text-ink-900 hover:text-brand-700"
                            >
                              {w.workOrderNumber}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-ink-700">
                            <div className="font-medium text-ink-900">
                              {[w.assetId, w.machineName].filter(Boolean).join(" ") || w.title}
                            </div>
                            {w.location && (
                              <div className="text-xs text-ink-400 mt-0.5">{w.location}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <Badge className={WO_STATUS_BADGE[w.status] ?? WO_STATUS_BADGE.OPEN}>
                              {WO_STATUS_LABELS[w.status] ?? w.status}
                            </Badge>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {isComplete ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className="inline-flex items-center gap-1 text-xs text-brand-700 font-medium">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" /> Done
                                </span>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  href={`/work-orders/${w.id}/pm-checklist`}
                                  icon={FileText}
                                >
                                  View Checklist
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                href={`/work-orders/${w.id}/pm-checklist`}
                                icon={ClipboardCheck}
                              >
                                Fill Checklist
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Completed PM Work & Execution Records table */}
            {batch.workOrders.some((w) => w.status === "COMPLETED" || w.checklist?.completed) && (
              <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
                <header className="px-4 py-3 border-b border-line bg-brand-50/30">
                  <h2 className="text-sm font-semibold text-ink-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-brand-600" /> Completed PM Work & Execution Records
                  </h2>
                  <p className="text-xs text-ink-500 mt-0.5">
                    Logged work records, execution window timestamps (start to finish), inspection findings, and details.
                  </p>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-ink-500">
                        <th className="py-3 px-4 font-medium">Equipment</th>
                        <th className="py-3 px-4 font-medium whitespace-nowrap">Technician</th>
                        <th className="py-3 px-4 font-medium whitespace-nowrap">Execution Window</th>
                        <th className="py-3 px-4 font-medium">Findings & Work Done</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-200">
                      {batch.workOrders
                        .filter((w) => w.status === "COMPLETED" || w.checklist?.completed)
                        .map((w) => (
                          <tr key={w.id} className="hover:bg-ink-50">
                            <td className="py-3 px-4">
                              <div className="font-semibold text-ink-900">
                                {w.machineName ?? w.assetId ?? w.title}
                              </div>
                              <div className="text-xs text-ink-400">{w.assetId} · {w.workOrderNumber}</div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-ink-700">
                              {w.checklist?.technicianName || w.technicianName || "—"}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-ink-700">
                              <div className="flex items-center gap-1.5 text-ink-900">
                                <Clock className="w-3.5 h-3.5 text-ink-400" />
                                <span>{w.startedAt ? formatDate(w.startedAt) : "—"}</span>
                              </div>
                              {w.completedAt && (
                                <div className="text-xs text-ink-500 mt-0.5">
                                  Finished: {formatDate(w.completedAt)}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 max-w-xs">
                              <div className="line-clamp-2 text-ink-800">
                                {w.checklist?.observations || "All PM checkpoints verified and satisfactory."}
                              </div>
                              {w.checklist?.correctiveActionRequired && (
                                <div className="mt-1 flex items-center gap-1 text-danger-700 font-medium text-xs">
                                  <AlertTriangle className="w-3 h-3" />
                                  <span>Defect Flagged: {w.checklist.actionDescription || "Corrective action needed"}</span>
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  href={`/work-orders/${w.id}/pm-checklist`}
                                  icon={FileText}
                                >
                                  Checklist
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  href={`/work-orders/${w.id}`}
                                >
                                  Details
                                </Button>
                                {w.checklist?.correctiveActionRequired && w.equipmentId && (
                                  <Button
                                    size="sm"
                                    variant="danger"
                                    href={`/corrective/new?equipmentId=${w.equipmentId}`}
                                    icon={AlertTriangle}
                                  >
                                    Log CM
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>

          <FlowRail flow={batch.flow} role={role} links={links} className="lg:sticky lg:top-4" />
        </div>
      </main>
    </div>
  );
}
