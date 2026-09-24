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
import { WORK_ASSIGN_ROLES, WORK_ORDER_ASSIGNEE_ROLES } from "@/lib/roles";
import { WO_STATUS_LABELS, WO_STATUS_BADGE } from "@/lib/constants";
import type { FlowState } from "@/lib/maintenance/flow";
import { UserCheck } from "lucide-react";

type BatchWo = {
  id: string;
  workOrderNumber: string;
  title: string;
  status: string;
  assetId?: string | null;
  machineName?: string | null;
  technicianName?: string | null;
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
  wms: { id: string; wmsNumber: string; status: string } | null;
  jha: { id: string; jhaNumber: string; status: string } | null;
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
    WMS: batch.wms
      ? {
          ref: batch.wms.wmsNumber,
          href: `/wms/${batch.wms.id}`,
          waitingOn:
            batch.wms.status !== "APPROVED"
              ? `${batch.wms.wmsNumber} is written but not approved yet. It needs its signatures before HSE can build the hazard analysis.`
              : undefined,
        }
      : { actionHref: `/wms/new?batchId=${batch.id}` },
    JHA: batch.jha
      ? {
          ref: batch.jha.jhaNumber,
          href: `/jha/${batch.jha.id}`,
          waitingOn:
            batch.jha.status !== "APPROVED"
              ? `${batch.jha.jhaNumber} is raised but not approved yet. A permit cannot be issued against it until it is.`
              : undefined,
        }
      : batch.wms?.status === "APPROVED"
        ? { actionHref: `/jha/new?wmsId=${batch.wms.id}` }
        : { waitingOn: "The method statement has to be approved first." },
    PERMIT: batch.permit
      ? { ref: batch.permit.permitNumber, href: `/permits/${batch.permit.id}` }
      : batch.jha?.status === "APPROVED"
        ? { actionHref: `/permits/new?jhaId=${batch.jha.id}` }
        : { waitingOn: "The hazard analysis has to be approved first." },
    WORK: {
      waitingOn: batch.permit
        ? undefined
        : "No permit, no PM. Work cannot start until the permit is raised.",
      actionLabel: "Open each machine's work order below to complete its checklist",
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
            <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
              <header className="px-4 py-3 border-b border-line">
                <h2 className="text-sm font-semibold text-ink-900">
                  Machines in this batch
                </h2>
                <p className="text-xs text-ink-500 mt-0.5">
                  One work order each, because history and checklists are per machine. The method
                  statement, hazard analysis and permit cover all of them.
                </p>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-ink-500 text-xs">
                      <th className="py-2.5 px-4 font-medium whitespace-nowrap">WO #</th>
                      <th className="py-2.5 px-4 font-medium">Machine</th>
                      <th className="py-2.5 px-4 font-medium whitespace-nowrap">Technician</th>
                      <th className="py-2.5 px-4 font-medium whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200">
                    {batch.workOrders.map((w) => (
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
                          {[w.assetId, w.machineName].filter(Boolean).join(" ") || w.title}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap text-ink-600">
                          {w.technicianName ?? "—"}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Badge className={WO_STATUS_BADGE[w.status] ?? WO_STATUS_BADGE.OPEN}>
                            {WO_STATUS_LABELS[w.status] ?? w.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <FlowRail flow={batch.flow} role={role} links={links} className="lg:sticky lg:top-4" />
        </div>
      </main>
    </div>
  );
}
