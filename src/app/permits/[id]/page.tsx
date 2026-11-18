// src/app/permits/[id]/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { PAGE_MAIN } from "@/lib/page-shell";
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
  FileText,
  ClipboardList,
} from "lucide-react";
import { Badge } from "@/components/Badge";
import SignoffChain from "@/components/SignoffChain";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { PERMIT_STATUS_LABELS, PERMIT_STATUS_BADGE } from "@/lib/constants";
import PermitRenewalGrid from "@/components/PermitRenewalGrid";
import { RevalidationAsk } from "@/components/PermitValidityPanel";
import PermitHandback from "@/components/PermitHandback";
import PermitFace from "@/components/PermitFace";
import PermitPrintSheet from "@/components/PermitPrintSheet";
import { formatDate } from "@/lib/utils";
import { isPaperRecord } from "@/lib/maintenance/backfill";
import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { FIELD_CLASS, LABEL_CLASS } from "@/components/Field";
import { CANCEL_REASONS, cancelReasonOf } from "@/lib/hse/permit-cancel";
import {
  remainingLabel,
  expiryDateOf,
  DEFAULT_PERMIT_VALIDITY_DAYS,
  type RenewalDay,
  type RenewalSummary,
} from "@/lib/hse/permit-validity";
import {
  MAINTENANCE_WRITE_ROLES,
  PERMIT_ACCEPT_ROLES,
  PERMIT_RENEW_ROLES,
  PERMIT_WRITE_ROLES,
} from "@/lib/roles";

type Permit = {
  id: string;
  permitNumber: string;
  wmsId?: string | null;
  jhaId?: string | null;
  batchId?: string | null;
  workOrderId: string | null;
  workDescription: string;
  hazardsIdentified: string | null;
  controlMeasures: string | null;
  ppeRequired: string | null;
  lotoApplied: boolean | null;
  areaBarricaded: boolean | null;
  permitHolderId: string | null;
  permitHolderName: string | null;
  issuedDate: string | null;
  expiryDate: string | null;
  approvedAt: string | null;
  status: string;
  jha: string | null;
  taskNo: string | null;
  workTypes: string | null;
  facility: string | null;
  workArea: string | null;
  zoneClassification: string | null;
  startDate: string | null;
  startTime: string | null;
  durationHours: number | null;
  workerCount: number | null;
  permitDepartment: string | null;
  validityDays: number | null;
  documentMarks: string | null;
  precautionMarks: string | null;
  ppeMarks: string | null;
  additionalRequirements: string | null;
  handbackOutcome: string | null;
  handbackReason: string | null;
  handbackByName: string | null;
  handbackAt: string | null;
  handovers: string | null;
  acceptedByName: string | null;
  acceptedByDept: string | null;
  acceptedAt: string | null;
  closureReason: string | null;
  closureNote: string | null;
  equipment: { name: string; assetId: string; location: string | null } | null;
  machines?: { id: string; name: string; assetId: string; location: string | null }[];
  batch?: { id: string; batchNumber: string; workOrderNumber: string | null; title: string } | null;
  wms: { id: string; wmsNumber: string; title: string; status: string } | null;
  jhaDocument: { id: string; jhaNumber: string; title: string; status: string; steps: string | null } | null;
  workOrder: { id: string; workOrderNumber: string; title: string; status: string } | null;
  supersedes: { id: string; permitNumber: string } | null;
  supersededBy: { id: string; permitNumber: string } | null;
  validity: {
    startDate: string;
    validityDays: number;
    days: string[];
    marks: Record<string, RenewalDay>;
    summary: RenewalSummary;
    endedOn?: string | null;
  } | null;
  closeout: { total: number; signed: number; complete: boolean } | null;
  approvalSteps: SignoffStep[];
  closeoutSteps: SignoffStep[];
};

type SignoffStep = {
  roleLabel: string;
  status: string;
  signedByName: string | null;
  signedAt: string | null;
  signatureData: string | null;
};

type JhaRow = { task: string; hazards: string; controls: string; residualRisk: string };

function safeParse(v: string | null): string[] {
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.map((x) => (typeof x === "string" ? x : String(x))) : [];
  } catch {
    return [];
  }
}

const REMAINING_TONE: Record<string, string> = {
  OK: "bg-ink-500/10 text-ink-600 border-ink-500/20",
  SOON: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  LAST_DAY: "bg-danger-500/10 text-danger-600 border-danger-500/20",
  EXPIRED: "bg-danger-600 text-white border-danger-700",
};

export default function PermitDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const role = (session?.user as { role?: string })?.role;
  const canWrite = mounted && PERMIT_WRITE_ROLES.includes(role ?? "");
  // The AHS block on paper. HSE issues the permit but does not renew it, the
  // supervisor holding the asset does. Both sets are the ones the renew and
  // hand-back routes gate on, imported rather than restated, so the button and
  // the server can never disagree about who may press it.
  const canRenew = mounted && PERMIT_RENEW_ROLES.includes(role ?? "");
  const canHandback = mounted && MAINTENANCE_WRITE_ROLES.includes(role ?? "");
  const canAccept = mounted && PERMIT_ACCEPT_ROLES.includes(role ?? "");

  const [permit, setPermit] = useState<Permit | null>(null);
  // Cancelling asks why, so the correction and the reissue start from it.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string>("JHA");
  const [cancelText, setCancelText] = useState("");
  const [cancelling, setCancelling] = useState(false);
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
    if (cancelText.trim().length < 10) {
      toast.error("Say what has to be corrected, in a sentence.");
      return;
    }
    setCancelling(true);
    const res = await fetch(`/api/permits/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED", reason: cancelReason, note: cancelText.trim() }),
    });
    setCancelling(false);
    if (res.ok) {
      toast.success("Permit cancelled", {
        description: "Its signers and HSE have been told why. Correct the document, then raise the new permit.",
      });
      setCancelOpen(false);
      setCancelText("");
      load();
    } else {
      const e = await res.json().catch(() => ({}));
      toast.error(e.error || "Failed to cancel permit.");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-500">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!permit) {
    return (
      <div className="p-10 text-center text-ink-500">
        Permit not found. <Link href="/permits" className="text-brand-600 hover:underline">Back to permits</Link>
      </div>
    );
  }

  const ppe = safeParse(permit.ppeRequired);
  let jhaRows: JhaRow[] = [];
  try {
    const p = permit.jha ? JSON.parse(permit.jha) : [];
    if (Array.isArray(p)) jhaRows = p;
  } catch {
    jhaRows = [];
  }
  // How long is left, in words. An active permit that only shows its expiry
  // date makes the reader do the date arithmetic themselves, at the point where
  // getting it wrong means working on an authorisation that has run out.
  const remaining =
    permit.startDate && permit.status === "ACTIVE"
      ? remainingLabel(
          permit.startDate,
          permit.validityDays ?? DEFAULT_PERMIT_VALIDITY_DAYS,
          new Date().toISOString().slice(0, 10),
        )
      : null;

  const isActive = permit.status === "ACTIVE";
  const isPending = permit.status === "PENDING_APPROVAL";
  const onPaper = isPaperRecord(permit.closureNote);
  // The work type of a permit entered from the file is on the paper copy.
  const shownPermit = onPaper ? { ...permit, workTypes: null } : permit;
  const isDead = permit.status === "CLOSED" || permit.status === "CANCELLED" || permit.status === "EXPIRED";

  return (
    <div className="min-h-screen bg-canvas text-ink-900 font-sans">
      <main className={PAGE_MAIN.detail}>
        {/* The filed document. A printed screenshot of this page would not be
            the same paper the pad produces, and the two have to be readable
            side by side. */}
        <PermitPrintSheet
          permit={shownPermit}
          chain={permit.approvalSteps ?? []}
          closeout={permit.closeoutSteps ?? []}
        />

        <Modal
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title={`Cancel ${permit.permitNumber}`}
          subtitle="Withdraw the permit so the paperwork behind it can be corrected and the permit reissued."
        >
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLASS}>What is wrong</label>
              <Select value={cancelReason} onChange={setCancelReason} ariaLabel="Reason for cancelling" className="w-full">
                {CANCEL_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="cancel-note">
                What has to be corrected
              </label>
              <textarea
                id="cancel-note"
                value={cancelText}
                onChange={(e) => setCancelText(e.target.value)}
                placeholder="e.g. The JHA does not cover working at height on the crane gantry"
                className={`${FIELD_CLASS} h-24 resize-none`}
              />
              <p className="text-xs text-ink-500 mt-1">
                Signatures already given stay on record; nobody is asked for the rest. Its signers, the permit
                holder and HSE are told why.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setCancelOpen(false)}>
                Keep the permit
              </Button>
              <Button variant="danger" icon={XCircle} loading={cancelling} onClick={cancelPermit}>
                Cancel permit
              </Button>
            </div>
          </div>
        </Modal>

        <div className="screen-only space-y-8">
        {permit.status === "CANCELLED" && (
          <section className="no-print rounded-xl border border-danger-200 bg-danger-50 px-4 py-3" role="status">
            <p className="text-sm font-semibold text-danger-700 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" /> This permit was cancelled
            </p>
            {permit.closureNote && <p className="text-xs text-danger-700 mt-1 leading-relaxed">{permit.closureNote}</p>}
            {/* The way back: put the document right, then issue again. A JHA
                revision needs its own signatures before a permit can rest on
                it, and the new permit is raised against the corrected one. */}
            <div className="flex flex-wrap gap-2 mt-3">
              {cancelReasonOf(permit.closureNote) === "JHA" && permit.jhaId && permit.wmsId && (
                <Button size="sm" variant="secondary" href={`/jha/new?wmsId=${permit.wmsId}&supersedes=${permit.jhaId}`}>
                  Revise the JHA
                </Button>
              )}
              {cancelReasonOf(permit.closureNote) === "WMS" && permit.wmsId && (
                <Button size="sm" variant="secondary" href={`/wms/new?reviseId=${permit.wmsId}`}>
                  Revise the WMS
                </Button>
              )}
              {permit.batchId ? (
                <Button size="sm" href={`/pm-batches/${permit.batchId}`}>
                  Back to the batch to reissue
                </Button>
              ) : (
                <Button size="sm" href={`/permits/new${permit.jhaId ? `?jhaId=${permit.jhaId}` : ""}`}>
                  Raise a new permit
                </Button>
              )}
            </div>
          </section>
        )}

        {remaining && (
          <div
            className={`no-print flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${REMAINING_TONE[remaining.tone]}`}
            role="status"
          >
            <Clock className="w-4 h-4 shrink-0" />
            {remaining.label}
            <span className="font-normal opacity-80">
              · validity ends {formatDate(expiryDateOf(permit.startDate!, permit.validityDays ?? DEFAULT_PERMIT_VALIDITY_DAYS))}
            </span>
          </div>
        )}
        <div className="no-print">
          <Link href="/permits" className="inline-flex items-center gap-1.5 text-xs text-ink-500 hover:text-ink-900">
            <ArrowLeft className="w-3.5 h-3.5" /> All permits
          </Link>
        </div>

        {/* The headline: may work begin or not? */}
        {isPending && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-warn-300 bg-warn-50 text-warn-900">
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
          <div className="flex items-start gap-3 p-4 rounded-xl border border-brand-300 bg-brand-50 text-brand-900">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Approved, work is authorised</p>
              <p className="text-xs mt-0.5">
                Fully signed{permit.approvedAt ? ` on ${new Date(permit.approvedAt).toLocaleString()}` : ""}. Sign the
                close-out below when the job is complete.
              </p>
            </div>
          </div>
        )}
        {permit.status === "EXPIRED" && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-danger-300 bg-danger-50 text-danger-900">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Permit expired</p>
              <p className="text-xs mt-0.5">The permit window lapsed. Raise a new permit before resuming work.</p>
            </div>
          </div>
        )}

        {/* Permit header */}
        <div className="bg-surface border border-line rounded-xl shadow-card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-base font-semibold text-ink-900">{permit.permitNumber}</span>
                <Badge className={PERMIT_STATUS_BADGE[permit.status] ?? PERMIT_STATUS_BADGE.DRAFT}>{PERMIT_STATUS_LABELS[permit.status] ?? permit.status}</Badge>
                {permit.lotoApplied && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-info-700 bg-info-500/10 border border-info-500/20 rounded-full px-2 py-0.5">
                    <Lock className="w-3 h-3" /> LOTO
                  </span>
                )}
              </div>
              {(permit.machines?.length ?? 0) > 1 ? (
                <div className="mt-2">
                  <h2 className="text-xl font-bold tracking-tight">
                    {permit.batch ? (
                      <Link href={`/pm-batches/${permit.batch.id}`} className="hover:text-brand-600 hover:underline">
                        {permit.batch.workOrderNumber ?? permit.batch.batchNumber}
                      </Link>
                    ) : null}
                    {permit.batch ? " · " : ""}
                    {permit.machines!.length} machines
                  </h2>
                  {/* One permit, every machine in the batch: each is named, so
                      nobody has to open the batch to learn what is isolated. */}
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {permit.machines!.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/equipment/${m.assetId.replace(/\//g, "-")}`}
                          className="text-xs px-2 py-1 rounded-lg bg-ink-100 text-ink-700 border border-line hover:border-brand-400 inline-block"
                        >
                          {m.name || m.assetId}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
              <h2 className="text-xl font-bold tracking-tight mt-2">
                {permit.equipment?.assetId ? (
                  <Link
                    href={`/equipment/${permit.equipment.assetId.replace(/\//g, "-")}`}
                    className="hover:text-brand-600 hover:underline"
                  >
                    {permit.equipment.name || permit.equipment.assetId}
                  </Link>
                ) : (
                  permit.equipment?.name
                )}
              </h2>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0 no-print">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-ink-300 text-ink-700 hover:bg-ink-100 rounded-lg text-xs font-semibold"
              >
                <Printer className="w-4 h-4" /> Print
              </button>
              {canWrite && !isDead && (
                <button
                  onClick={() => setCancelOpen(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-danger-200 text-danger-700 hover:bg-danger-50 rounded-lg text-xs font-semibold"
                >
                  <XCircle className="w-4 h-4" /> Cancel Permit
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-ink-200">
            <Meta icon={<User className="w-3.5 h-3.5" />} label="Permit Holder" value={permit.permitHolderName ?? "-"} strong />
            <Meta
              icon={<Clock className="w-3.5 h-3.5" />}
              label="Expires"
              value={
                permit.expiryDate
                  ? onPaper
                    ? formatDate(permit.expiryDate)
                    : new Date(permit.expiryDate).toLocaleString()
                  : "-"
              }
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
              <h3 className="text-xs font-semibold text-ink-500 mb-2">Required PPE</h3>
              <div className="flex flex-wrap gap-2">
                {ppe.map((p) => (
                  <span key={p} className="px-2 py-1 rounded-lg bg-ink-100 border border-ink-200 text-xs text-ink-700 capitalize">
                    {p.replace(/([A-Z])/g, " $1")}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* The chain behind this permit. Every signer should be able to walk
              back to the work order that authorised the job. */}
          <div className="pt-4 border-t border-ink-200">
            <h3 className="text-xs font-semibold text-ink-500 mb-2">
              Authorising documents
            </h3>
            <div className="flex flex-wrap gap-2">
              {permit.workOrder && (
                <Link
                  href={`/work-orders/${permit.workOrder.id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-700 text-xs font-semibold hover:border-ink-300"
                >
                  <ClipboardList className="w-3.5 h-3.5" /> {permit.workOrder.workOrderNumber}
                </Link>
              )}
              {permit.wms && (
                <Link
                  href={`/wms/${permit.wms.id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-700 text-xs font-semibold hover:border-ink-300"
                >
                  <FileText className="w-3.5 h-3.5" /> {permit.wms.wmsNumber}
                </Link>
              )}
              {permit.jhaDocument && (
                <Link
                  href={`/jha/${permit.jhaDocument.id}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-brand-200 bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> {permit.jhaDocument.jhaNumber}
                </Link>
              )}
              {!permit.workOrder && !permit.wms && !permit.jhaDocument && (
                <p className="text-xs text-ink-400">
                  Raised before the document chain was enforced, so it carries no linked documents.
                </p>
              )}
            </div>
          </div>

          {/* Permits either side of this one, when a job ran over several weeks. */}
          {(permit.supersedes || permit.supersededBy) && (
            <div className="pt-4 border-t border-ink-200">
              <h3 className="text-xs font-semibold text-ink-500 mb-2">
                Continuation
              </h3>
              <div className="flex flex-wrap gap-2 text-xs">
                {permit.supersedes && (
                  <Link
                    href={`/permits/${permit.supersedes.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-700 font-semibold hover:border-ink-300"
                  >
                    Continues {permit.supersedes.permitNumber}
                  </Link>
                )}
                {permit.supersededBy && (
                  <Link
                    href={`/permits/${permit.supersededBy.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-200 bg-white text-ink-700 font-semibold hover:border-ink-300"
                  >
                    Continued under {permit.supersededBy.permitNumber}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>

        {onPaper && (
          <p className="rounded-xl border border-info-200 bg-info-50 px-4 py-3 text-sm text-info-900">
            Entered from the paper permit. Its work type, precautions, PPE, daily validity record and handback are on
            the paper copy held by Maintenance.
          </p>
        )}

        {/* The permit face: work types and the three checklists as marked. */}
        <PermitFace permit={shownPermit} />

        {/* Validity and renewal, one column per day of the period. The permit
            holder asks for each day's revalidation from here. */}
        {permit.validity && <RevalidationAsk permit={permit} onAsked={load} />}
        {permit.validity && (
          <PermitRenewalGrid
            permitId={permit.id}
            days={permit.validity.days}
            marks={permit.validity.marks}
            summary={permit.validity.summary}
            endedOn={permit.validity.endedOn ?? null}
            onPaper={onPaper}
            canRenew={canRenew && isActive}
            onSaved={load}
          />
        )}

        {/* Handback, handover and work acceptance. */}
        {!onPaper && (
          <PermitHandback
            permit={permit}
            canHandback={canHandback && !isPending}
            canAccept={canAccept}
            onSaved={load}
          />
        )}

        {/* Authorisation chain, must be complete before work begins */}
        <SignoffChain
          entityType="PERMIT"
          entityId={permit.id}
          title="Permit authorisation"
        />

        {/* Close-out chain, only exists once the permit is approved */}
        {permit.closeout && (
          <SignoffChain
            entityType="PERMIT_CLOSEOUT"
            entityId={permit.id}
            title="Permit close-out"
          />
        )}
        </div>
      </main>
    </div>
  );
}

function Meta({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-ink-500">
        {icon} {label}
      </div>
      <p className={`mt-1 text-sm ${strong ? "font-bold text-ink-900" : "text-ink-700"}`}>{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-ink-500 mb-1">{title}</h3>
      <p className="text-sm text-ink-700 whitespace-pre-wrap">{children}</p>
    </div>
  );
}
