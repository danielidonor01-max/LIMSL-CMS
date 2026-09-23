// src/components/WorkOrderQuickViewModal.tsx
"use client";

import Modal from "@/components/Modal";
import Button from "@/components/Button";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/utils";
import {
  WO_STATUS_BADGE,
  WO_STATUS_LABELS,
  WO_TYPE_LABELS,
  PRIORITY_LABELS,
} from "@/lib/constants";
import {
  ExternalLink,
  Clock,
  User,
  Wrench,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Calendar,
  Layers,
} from "lucide-react";

type WorkOrderRow = {
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
  technicianName: string | null;
  assistantIds?: string | null;
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

export default function WorkOrderQuickViewModal({
  open,
  onClose,
  workOrder,
  canSignNext,
  onOpenSign,
  onStartWork,
  onOpenComplete,
  onResubmit,
}: {
  open: boolean;
  onClose: () => void;
  workOrder: WorkOrderRow | null;
  canSignNext?: boolean;
  onOpenSign?: () => void;
  onStartWork?: () => void;
  onOpenComplete?: () => void;
  onResubmit?: () => void;
}) {
  if (!workOrder) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${workOrder.workOrderNumber} · Quick Review`}
      subtitle={workOrder.title}
    >
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        {/* Status and Type Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-ink-50 border border-ink-200 rounded-lg">
          <div className="flex items-center gap-2">
            <Badge className={WO_STATUS_BADGE[workOrder.status]}>
              {WO_STATUS_LABELS[workOrder.status] ?? workOrder.status}
            </Badge>
            <span className="text-xs font-semibold text-ink-700">
              {WO_TYPE_LABELS[workOrder.type] ?? workOrder.type}
            </span>
          </div>
          <div className="text-xs">
            <span className="text-ink-400">Priority: </span>
            <span
              className={
                workOrder.priority === "CRITICAL" || workOrder.priority === "HIGH"
                  ? "font-bold text-danger-600"
                  : "font-semibold text-ink-700"
              }
            >
              {PRIORITY_LABELS[workOrder.priority] ?? workOrder.priority}
            </span>
          </div>
        </div>

        {/* Rejection Warning Banner */}
        {workOrder.status === "REJECTED" && workOrder.rejectedStep && (
          <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg text-xs space-y-1">
            <div className="font-bold text-danger-900 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-danger-600" />
              Returned for Revision by {workOrder.rejectedStep.signedByName || workOrder.rejectedStep.roleLabel}
            </div>
            {workOrder.rejectedStep.comments && (
              <p className="text-danger-800 italic">"{workOrder.rejectedStep.comments}"</p>
            )}
          </div>
        )}

        {/* Machine & Location */}
        <div className="p-3 bg-white border border-ink-200 rounded-lg space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-ink-900 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-brand-600" /> Equipment
            </span>
            {workOrder.assetId && (
              <span className="text-brand-600 font-medium">{workOrder.assetId}</span>
            )}
          </div>
          <p className="text-ink-800 font-medium">{workOrder.equipmentName ?? "Unassigned"}</p>
          {workOrder.location && (
            <p className="text-ink-400">Location: {workOrder.location}</p>
          )}
        </div>

        {/* Description */}
        {workOrder.description && (
          <div className="p-3 bg-white border border-ink-200 rounded-lg space-y-1 text-xs">
            <span className="font-semibold text-ink-900">Task Scope / Description</span>
            <p className="text-ink-700 whitespace-pre-wrap">{workOrder.description}</p>
          </div>
        )}

        {/* Personnel & Timing */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-white border border-ink-200 rounded-lg space-y-1">
            <span className="font-semibold text-ink-900 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-info-600" /> Technician
            </span>
            <p className="text-ink-800">{workOrder.technicianName ?? "Not assigned yet"}</p>
          </div>
          <div className="p-3 bg-white border border-ink-200 rounded-lg space-y-1">
            <span className="font-semibold text-ink-900 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-brand-600" /> Planned Date
            </span>
            <p className="text-ink-800">{formatDate(workOrder.plannedDate)}</p>
          </div>
        </div>

        {/* Sign-off Chain Timeline */}
        {workOrder.chain && workOrder.chain.length > 0 && (
          <div className="p-3 bg-white border border-ink-200 rounded-lg space-y-2 text-xs">
            <span className="font-semibold text-ink-900 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-brand-600" /> Approval Sign-Off Chain
            </span>
            <div className="space-y-1.5 pt-1">
              {workOrder.chain.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2 rounded bg-ink-50 border border-ink-100"
                >
                  <div className="flex items-center gap-2">
                    {s.status === "SIGNED" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
                    ) : s.status === "REJECTED" ? (
                      <AlertCircle className="w-3.5 h-3.5 text-danger-600" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-ink-400" />
                    )}
                    <span className="font-medium text-ink-800">{s.roleLabel}</span>
                  </div>
                  <div className="text-right">
                    {s.status === "SIGNED" ? (
                      <span className="text-brand-700 font-medium">
                        {s.signedByName} · {formatDate(s.signedAt)}
                      </span>
                    ) : s.status === "REJECTED" ? (
                      <span className="text-danger-700 font-semibold">Rejected</span>
                    ) : (
                      <span className="text-ink-400">Awaiting signature</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Modal Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-ink-200">
          <Link
            href={`/work-orders/${workOrder.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-semibold hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open Full Detail Page
          </Link>

          <div className="flex items-center gap-2">
            {workOrder.status === "REJECTED" && onResubmit && (
              <Button size="sm" variant="secondary" icon={RotateCcw} onClick={onResubmit}>
                Revise & Resubmit
              </Button>
            )}

            {canSignNext && onOpenSign && (
              <Button size="sm" icon={CheckCircle2} onClick={onOpenSign}>
                Sign Step
              </Button>
            )}

            {workOrder.status === "OPEN" && onStartWork && (
              <Button size="sm" icon={Play} onClick={onStartWork}>
                Start Work
              </Button>
            )}

            {workOrder.status === "IN_PROGRESS" && onOpenComplete && (
              <Button size="sm" variant="primary" icon={CheckCircle2} onClick={onOpenComplete}>
                Complete Job
              </Button>
            )}

            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
