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
import { formatDate, formatDateTime } from "@/lib/utils";
import { useApi } from "@/lib/api-cache";
import PageHeader from "@/components/PageHeader";
import PageLead from "@/components/PageLead";
import Tabs from "@/components/Tabs";
import KebabMenu, { type KebabItem } from "@/components/KebabMenu";
import { defectOutcome } from "@/lib/maintenance/pm-defect";
import { isPaperRecord } from "@/lib/maintenance/backfill";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { Badge } from "@/components/Badge";
import FlowRail, { type FlowLink } from "@/components/FlowRail";
import SignoffChain from "@/components/SignoffChain";
import PermitValidityPanel from "@/components/PermitValidityPanel";
import TableSkeleton from "@/components/TableSkeleton";
import WorkDateCorrections from "@/components/WorkDateCorrections";
import { WORK_ASSIGN_ROLES, WORK_ORDER_ASSIGNEE_ROLES, JHA_WRITE_ROLES, PERMIT_ISSUE_ROLES } from "@/lib/roles";
import { WO_STATUS_BADGE } from "@/lib/constants";
import type { FlowState } from "@/lib/maintenance/flow";
import { formatHours } from "@/lib/maintenance/time-log";

// Elapsed time runs over days, where "75h" is harder to read than "3d 3h".
function formatElapsed(hours: number): string {
  if (hours < 24) return formatHours(hours);
  const totalH = Math.round(hours);
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  return h ? `${d}d ${h}h` : `${d}d`;
}
import {
  UserCheck,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
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
  manHours?: number;
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
  /** The batch's one work order. Null on batches raised one work order per machine. */
  workOrderNumber?: string | null;
  title: string;
  categoryLabel: string;
  plannedDate: string;
  status: string;
  assignedToId?: string | null;
  assignedToName?: string | null;
  assignedByName?: string | null;
  assignedAt?: string | null;
  workOrders: BatchWo[];
  /** Labour and duration across every machine (lib/maintenance/time-log.ts, jobTime). */
  time?: {
    manHours: number;
    people: number;
    running: number;
    startedAt: string | null;
    finishedAt: string | null;
    elapsedHours: number | null;
  };
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
  const [tab, setTab] = useState<"machines" | "documents">("machines");

  // Live: the documents and machines are re-read every 20 seconds and when
  // the tab comes back into view, so a signature elsewhere shows up here
  // without a reload. The refresh is silent once the page has data.
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && refresh();
    const timer = window.setInterval(tick, 20000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    // One approval for the batch, signed in the panel on this page.
    WORK_ORDER: batch.workOrderNumber
      ? batch.flow.done.includes("WORK_ORDER")
        ? { ref: `${batch.workOrderNumber} approved` }
        : {
            ref: batch.workOrderNumber,
            waitingOn: "Waiting on the batch approval: the Foreman raises it and the Maintenance Manager approves it, on this page.",
          }
      : { ref: `${batch.workOrders.length} raised` },
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

  const isDone = (w: BatchWo) => w.status === "COMPLETED" || Boolean(w.checklist?.completed);
  const live = batch.workOrders.filter((w) => w.status !== "CANCELLED");
  const total = live.length;
  const doneCount = live.filter(isDone).length;
  const allDone = total > 0 && doneCount >= total;
  // Entered from the paper file: the results are on the paper, so a blank here
  // is not "no defects", and the date carries no time of day.
  const onPaper = live.some((w) => isPaperRecord(w.checklist?.observations));
  const whenDone = (d: string) => (onPaper ? formatDate(d) : formatDateTime(d));
  const outcomes = live.map((w) => (w.checklist ? defectOutcome(w.checklist) : "NONE"));
  const fixedCount = outcomes.filter((o) => o === "FIXED").length;
  const openCount = outcomes.filter((o) => o === "OPEN").length;
  const lastFinished =
    live
      .map((w) => w.checklist?.signedAt ?? w.completedAt ?? null)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1) ?? null;
  // Man-hours are labour (two people for three hours is six); elapsed is how
  // long the machines were tied up, nights included. Nothing is shown for
  // either when nobody clocked on, rather than a zero that reads as "no work".
  const time = batch.time;
  const clocked = !!time && (time.manHours > 0 || time.running > 0);
  const manHoursText = clocked
    ? `${formatHours(time!.manHours)}${time!.people > 1 ? `, ${time!.people} people` : ""}`
    : onPaper
      ? "On the paper record"
      : "Nobody clocked on";
  const elapsedText = time?.elapsedHours != null ? formatElapsed(time.elapsedHours) : "-";
  // Still to do first, in the batch's own order; the first of them is next.
  const ordered = [...live.filter((w) => !isDone(w)), ...live.filter(isDone)];
  const nextUp = ordered.find((w) => !isDone(w)) ?? null;

  const headline = allDone
    ? total === 1
      ? "1 machine serviced"
      : `All ${total} machines serviced`
    : doneCount > 0
      ? `${doneCount} of ${total} machines done`
      : batch.assignedToName
        ? `${total} machine${total === 1 ? "" : "s"} to service`
        : "Nobody is on this batch yet";
  const supporting = onPaper
    ? `Work date ${formatDate(batch.plannedDate)}. Results and any defects are on the paper record.`
    : allDone
    ? `Finished ${lastFinished ? formatDateTime(lastFinished) : ""}. ${
        openCount > 0
          ? `${openCount} defect${openCount === 1 ? "" : "s"} still need${openCount === 1 ? "s" : ""} a repair.`
          : fixedCount > 0
            ? `${fixedCount} defect${fixedCount === 1 ? " was" : "s were"} found and fixed during the PM.`
            : "No defects found."
      }`
    : nextUp
      ? `Next: ${nextUp.machineName ?? nextUp.title}. The method statement, hazard analysis and permit cover every machine in the batch.`
      : "The method statement, hazard analysis and permit cover every machine in the batch.";

  // Every document the batch runs under, as it stands right now.
  const docs: { key: string; kind: string; number: string; status: string; href?: string }[] = [
    ...(batch.workOrderNumber
      ? [{
          key: "wo",
          kind: "Batch work order",
          number: batch.workOrderNumber,
          status: batch.flow.done.includes("WORK_ORDER") ? "APPROVED" : "PENDING_APPROVAL",
        }]
      : []),
    ...(batch.wms
      ? [{ key: "wms", kind: "Method statement", number: `${batch.wms.wmsNumber} rev ${batch.wms.revision ?? 0}`, status: batch.wms.status, href: `/wms/${batch.wms.id}` }]
      : []),
    ...(batch.jha
      ? [{ key: "jha", kind: "Hazard analysis", number: `${batch.jha.jhaNumber} rev ${batch.jha.revision ?? 0}`, status: batch.jha.status, href: `/jha/${batch.jha.id}` }]
      : []),
    ...(batch.permit
      ? [{ key: "ptw", kind: "Permit to work", number: batch.permit.permitNumber, status: batch.permit.status, href: `/permits/${batch.permit.id}` }]
      : []),
    ...live.map((w) => ({
      key: `chk-${w.id}`,
      kind: `PM checklist, ${w.machineName ?? w.assetId ?? ""}`.trim(),
      number: w.workOrderNumber,
      status: w.checklist ? "FILED" : "NOT_FILED",
      href: w.checklist ? `/work-orders/${w.id}` : undefined,
    })),
  ];
  const missing = [
    !batch.wms && "Method statement",
    !batch.jha && "Hazard analysis",
    !batch.permit && "Permit to work",
  ].filter(Boolean) as string[];

  // The machines and documents, shown at full width once the batch is
  // finished and beside the road while it is under way.
  const workArea = (
      <div className="space-y-5 min-w-0">
        {/* One work order for the batch, approved once. */}
        {batch.workOrderNumber && !allDone && (
          <SignoffChain
            entityType="PM_BATCH"
            entityId={batch.id}
            title={`Batch work order ${batch.workOrderNumber}, approval to commence`}
            onChange={refresh}
          />
        )}

        <Tabs
          ariaLabel="Batch views"
          value={tab}
          onChange={setTab}
          items={[
            { value: "machines", label: "Machines", count: total },
            { value: "documents", label: "Documents", count: docs.length },
          ]}
        />

        {tab === "machines" ? (
          <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-500 text-xs">
                    <th className="py-2.5 pl-5 pr-3 font-medium">Machine</th>
                    <th className="py-2.5 px-3 font-medium whitespace-nowrap">Done</th>
                    <th className="py-2.5 px-3 font-medium whitespace-nowrap">Man-hours</th>
                    <th className="py-2.5 px-3 font-medium">Findings</th>
                    <th className="py-2.5 pl-3 pr-5 font-medium text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {ordered.map((w) => {
                    const done = isDone(w);
                    const finished = w.checklist?.signedAt ?? w.completedAt ?? null;
                    const outcome = w.checklist ? defectOutcome(w.checklist) : "NONE";
                    const findings = w.checklist?.observations?.trim();
                    const isNext = !done && w.id === nextUp?.id;
                    const menu: KebabItem[] = [
                      ...(w.checklist && !onPaper
                        ? [{ label: "View checklist", icon: FileText, href: `/work-orders/${w.id}/pm-checklist` }]
                        : []),
                      { label: "Open work order", icon: ExternalLink, href: `/work-orders/${w.id}` },
                      // Only a defect still waiting for a repair is offered
                      // as a fault. One fixed during the PM is closed.
                      ...(outcome === "OPEN" && w.equipmentId
                        ? [{ label: "Report as a fault", icon: AlertTriangle, href: `/corrective/new?equipmentId=${w.equipmentId}`, danger: true }]
                        : []),
                    ];
                    return (
                      <tr key={w.id} className={isNext ? "bg-brand-50/40" : "hover:bg-ink-50"}>
                        <td className="py-3 pl-5 pr-3 align-top">
                          <div className="flex items-start gap-2.5">
                            {done ? (
                              <CheckCircle2 className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" aria-label="Done" />
                            ) : (
                              <CircleDashed className="w-4 h-4 text-ink-300 shrink-0 mt-0.5" aria-label="Not done" />
                            )}
                            <div className="min-w-0">
                              <p className="font-medium text-ink-900">{w.machineName ?? w.title}</p>
                              <p className="text-xs text-ink-500 mt-0.5">
                                {w.location ? `${w.location} · ` : ""}
                                <Link href={`/work-orders/${w.id}`} className="hover:text-brand-700 hover:underline whitespace-nowrap">
                                  {w.workOrderNumber}
                                </Link>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap">
                          {done ? (
                            <>
                              <p className="text-ink-900">{finished ? whenDone(finished) : "Done"}</p>
                              {(w.checklist?.technicianName || w.technicianName) && (
                                <p className="text-xs text-ink-500 mt-0.5">
                                  by {w.checklist?.technicianName || w.technicianName}
                                </p>
                              )}
                            </>
                          ) : (
                            <Badge className={w.status === "IN_PROGRESS" ? WO_STATUS_BADGE.IN_PROGRESS : "bg-ink-100 text-ink-600"}>
                              {w.status === "IN_PROGRESS" ? "In progress" : "Not started"}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-3 align-top whitespace-nowrap text-ink-700">
                          {w.manHours ? formatHours(w.manHours) : <span className="text-ink-400">-</span>}
                        </td>
                        <td className="py-3 px-3 align-top min-w-48">
                          {!done ? (
                            <span className="text-ink-400">-</span>
                          ) : isPaperRecord(findings) ? (
                            <span className="text-ink-600">On the paper record</span>
                          ) : outcome === "NONE" ? (
                            <span className="text-ink-600">{findings || "No defects"}</span>
                          ) : (
                            <div className="space-y-1">
                              <Badge
                                className={
                                  outcome === "OPEN"
                                    ? "bg-danger-500/10 text-danger-700 border-danger-500/20"
                                    : "bg-brand-500/10 text-brand-700 border-brand-500/20"
                                }
                              >
                                {outcome === "OPEN" ? "Needs a repair" : "Fixed during the PM"}
                              </Badge>
                              {findings && <p className="text-ink-900 line-clamp-2">{findings}</p>}
                              {w.checklist?.actionDescription && (
                                <p className="text-xs text-ink-500 line-clamp-2">
                                  {outcome === "OPEN" ? "Needs: " : "Done: "}
                                  {w.checklist.actionDescription}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pl-3 pr-5 align-top text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {!done && (
                              // The work order page carries the one road:
                              // start, then fill the checklist.
                              <Button size="sm" variant={isNext ? "primary" : "secondary"} href={`/work-orders/${w.id}`}>
                                {w.status === "IN_PROGRESS" ? "Continue" : "Start"}
                              </Button>
                            )}
                            <KebabMenu items={menu} ariaLabel={`Actions for ${w.assetId ?? w.workOrderNumber}`} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden">
            <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-3">
              <p className="text-sm text-ink-600">
                Everything this batch runs under, as it stands now.
              </p>
              <span className="text-xs text-ink-400 inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="size-1.5 rounded-full bg-brand-500 motion-safe:animate-pulse" /> Live
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-ink-500 text-xs">
                    <th className="py-2.5 pl-5 pr-3 font-medium">Document</th>
                    <th className="py-2.5 px-3 font-medium whitespace-nowrap">Number</th>
                    <th className="py-2.5 px-3 font-medium">Status</th>
                    <th className="py-2.5 pl-3 pr-5 font-medium text-right">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {docs.map((d) => (
                    <tr key={d.key} className="hover:bg-ink-50">
                      <td className="py-3 pl-5 pr-3 text-ink-900">{d.kind}</td>
                      <td className="py-3 px-3 whitespace-nowrap text-ink-700">{d.number}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <Badge className={DOC_TONE[d.status] ?? "bg-ink-100 text-ink-600"}>
                          {DOC_LABEL[d.status] ?? d.status.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right whitespace-nowrap">
                        {d.href && (
                          <Link href={d.href} className="text-sm font-medium text-brand-700 hover:underline">
                            Open
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                  {missing.map((m) => (
                    <tr key={m}>
                      <td className="py-3 pl-5 pr-3 text-ink-500">{m}</td>
                      <td className="py-3 px-3 text-ink-400">-</td>
                      <td className="py-3 px-3">
                        <Badge className="bg-ink-100 text-ink-600">Not raised yet</Badge>
                      </td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        {/* The permit's validity record, live with the documents: the holder
            asks for each day's revalidation, the Factory Manager signs it. */}
        {tab === "documents" && batch.permit && <PermitValidityPanel permitId={batch.permit.id} />}
      </div>
  );

  return (
    <div className="min-h-screen bg-canvas text-ink-900 flex flex-col font-sans">
      <main className={PAGE_MAIN.detail}>
        <PageHeader
          title={batch.workOrderNumber ? `${batch.batchNumber} · ${batch.workOrderNumber}` : batch.batchNumber}
          subtitle={`${batch.categoryLabel} · planned ${formatDate(batch.plannedDate)} · ${total} machine${total === 1 ? "" : "s"}`}
          backHref="/pm-batches"
          backLabel="PM Batches"
        />

        {/* Finished: the lead and the status report side by side, and the
            machines below at full width. Under way: the lead, then the
            machines beside the road (each step an action someone takes). */}
        {allDone ? (
          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-stretch">
            <div className="min-w-0">
            {/* The same lead card as the dashboard and My Work: the answer, one
                sentence, and the one figure in the dark panel. */}
            <PageLead
              headingId="batch-lead"
              headline={headline}
              supporting={supporting}
              figure={{
                label: "Machines done",
                value: String(doneCount),
                unit: `/ ${total}`,
                progress: total ? (doneCount / total) * 100 : 0,
                tone: allDone ? "good" : "warn",
              }}
              stats={
                onPaper
                  ? [{ label: "to do", value: total - doneCount, tone: "warn" }]
                  : [
                      { label: "need a repair", value: openCount, tone: "bad" },
                      { label: "fixed in the PM", value: fixedCount },
                      { label: "to do", value: total - doneCount, tone: "warn" },
                    ]
              }
              meta={
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-ink-400" />
                    {batch.assignedToName ? (
                      <>
                        <span className="font-medium text-ink-900">{batch.assignedToName}</span>
                        {batch.assignedByName &&
                          ` · assigned by ${batch.assignedByName}${batch.assignedAt ? ` on ${formatDate(batch.assignedAt)}` : ""}`}
                      </>
                    ) : (
                      "Nobody assigned"
                    )}
                  </span>
                  {canAssign && !allDone && !assignOpen && (
                    <button
                      type="button"
                      onClick={() => setAssignOpen(true)}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      {batch.assignedToName ? "Reassign" : "Assign"}
                    </button>
                  )}
                </>
              }
            />

            {assignOpen && canAssign && (
              <section className="bg-surface border border-line rounded-xl shadow-card p-4 flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <label className="text-xs font-medium text-ink-700 block mb-1" htmlFor="batch-assignee">
                    Assign the whole batch to
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
              </section>
            )}

            </div>
              <section className="bg-surface border border-line rounded-xl shadow-card overflow-hidden h-full flex flex-col md:flex-row 2xl:flex-col">
                <div className="p-5 flex items-center gap-3 border-b md:border-b-0 md:border-r 2xl:border-r-0 2xl:border-b border-line shrink-0">
                  <span className="flex size-10 items-center justify-center rounded-full bg-brand-500 text-white shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="text-xs text-ink-500">Status</p>
                    <p className="text-base font-semibold text-ink-900">Completed</p>
                  </div>
                </div>
                <dl className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-1 divide-y sm:divide-y-0 2xl:divide-y divide-line text-sm">
                  {[
                    ...(time?.startedAt ? [["Started", formatDateTime(time.startedAt)]] : []),
                    [onPaper ? "Work date" : "Finished", lastFinished ? whenDone(lastFinished) : "-"],
                    ...(time?.elapsedHours != null ? [["Elapsed", elapsedText]] : []),
                    ["Man-hours", manHoursText],
                    ["Machines", `${doneCount} of ${total}`],
                    ["Carried out by", batch.assignedToName ?? "-"],
                    ["Permit", batch.permit ? `${batch.permit.permitNumber} (${(DOC_LABEL[batch.permit.status] ?? batch.permit.status).toLowerCase()})` : "-"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-4 px-5 py-3 lg:flex-col lg:justify-center lg:gap-1 2xl:flex-row 2xl:justify-between 2xl:gap-4">
                      <dt className="text-ink-500">{k}</dt>
                      <dd className="text-ink-900 text-right lg:text-left 2xl:text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
          </div>
        ) : (
          <>
          {/* The same lead card as the dashboard and My Work: the answer, one
              sentence, and the one figure in the dark panel. */}
          <PageLead
            headingId="batch-lead"
            headline={headline}
            supporting={supporting}
            figure={{
              label: "Machines done",
              value: String(doneCount),
              unit: `/ ${total}`,
              progress: total ? (doneCount / total) * 100 : 0,
              tone: allDone ? "good" : "warn",
            }}
            stats={[
              { label: "need a repair", value: openCount, tone: "bad" },
              { label: "fixed in the PM", value: fixedCount },
              { label: "to do", value: total - doneCount, tone: "warn" },
              ...(clocked
                ? [{ label: time!.running > 0 ? `man-hours, ${time!.running} on now` : "man-hours so far", value: formatHours(time!.manHours) }]
                : []),
            ]}
            meta={
              <>
                <span className="inline-flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-ink-400" />
                  {batch.assignedToName ? (
                    <>
                      <span className="font-medium text-ink-900">{batch.assignedToName}</span>
                      {batch.assignedByName &&
                        ` · assigned by ${batch.assignedByName}${batch.assignedAt ? ` on ${formatDate(batch.assignedAt)}` : ""}`}
                    </>
                  ) : (
                    "Nobody assigned"
                  )}
                </span>
                {canAssign && !allDone && !assignOpen && (
                  <button
                    type="button"
                    onClick={() => setAssignOpen(true)}
                    className="font-semibold text-brand-700 hover:underline"
                  >
                    {batch.assignedToName ? "Reassign" : "Assign"}
                  </button>
                )}
              </>
            }
          />

          {assignOpen && canAssign && (
            <section className="bg-surface border border-line rounded-xl shadow-card p-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <label className="text-xs font-medium text-ink-700 block mb-1" htmlFor="batch-assignee">
                  Assign the whole batch to
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
            </section>
          )}

          </>
        )}

        {allDone ? (
          workArea
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
            {workArea}
            <FlowRail flow={batch.flow} role={role} links={links} className="xl:sticky xl:top-4" />
          </div>
        )}

        {allDone && <WorkDateCorrections batchId={batch.id} canRequest={canAssign && role !== "MAINTENANCE_MANAGER"} />}
      </main>
    </div>
  );
}

const DOC_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  PENDING_APPROVAL: "Awaiting approval",
  DRAFT: "Draft",
  SUPERSEDED: "Superseded",
  ACTIVE: "Active",
  PENDING: "Awaiting signatures",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  REJECTED: "Returned",
  FILED: "Filed",
  NOT_FILED: "Not filed yet",
};

const DOC_TONE: Record<string, string> = {
  APPROVED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  ACTIVE: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  FILED: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  CLOSED: "bg-ink-100 text-ink-700",
  PENDING_APPROVAL: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  PENDING: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  REJECTED: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  CANCELLED: "bg-danger-500/10 text-danger-700 border-danger-500/20",
};
