// src/components/CorrectiveFlow.tsx
// The repair flow on a breakdown record.
//
// A reported fault used to sit there being edited. The decisions that actually
// move a repair — the Factory Manager agreeing it goes ahead, the Foreman
// putting a name on it, that person raising the work order — were fields
// anybody could set in any order, so the record could not tell you whether a
// repair had been authorised or somebody had just typed a name in a box.
//
// Each of those is now a named act with its own gate, and this is where they
// are taken.
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import FlowRail, { type FlowLink } from "@/components/FlowRail";
import Button from "@/components/Button";
import Select from "@/components/Select";
import { WORK_ASSIGN_ROLES, WORK_ORDER_ASSIGNEE_ROLES } from "@/lib/roles";
import type { FlowState } from "@/lib/maintenance/flow";

type Doc = { id: string; status: string } | null;

type FlowResponse = {
  flow: FlowState;
  workOrder: { id: string; workOrderNumber: string; status: string } | null;
  wms: (Doc & { wmsNumber: string }) | null;
  jha: (Doc & { jhaNumber: string }) | null;
  permit: (Doc & { permitNumber: string }) | null;
  assignedToName: string | null;
  repairAuthorisedByName: string | null;
};

export default function CorrectiveFlow({
  recordId,
  role,
  onChanged,
}: {
  recordId: string;
  role: string | null;
  /** Called after an action lands, so the page around this reloads its record. */
  onChanged?: () => void;
}) {
  const [data, setData] = useState<FlowResponse | null>(null);
  const [staff, setStaff] = useState<{ id: string; name: string; role: string }[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/corrective/${recordId}/flow`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => {});
  }, [recordId]);

  useEffect(load, [load]);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((u) => setStaff(Array.isArray(u) ? u : []))
      .catch(() => {});
  }, []);

  const assignees = useMemo(
    () => staff.filter((u) => WORK_ORDER_ASSIGNEE_ROLES.includes(u.role)),
    [staff],
  );

  const act = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/corrective/${recordId}/flow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(d.error || "That could not be done.");
        return null;
      }
      toast.success(success);
      setAssignOpen(false);
      setPerson("");
      load();
      onChanged?.();
      return d;
    } finally {
      setBusy(false);
    }
  };

  if (!data?.flow) return null;

  const canAssign = WORK_ASSIGN_ROLES.includes(role ?? "");

  const links: Record<string, FlowLink> = {
    REPORT: {},
    MOTION: data.repairAuthorisedByName
      ? { ref: data.repairAuthorisedByName }
      : {
          actionLabel: "Authorise the repair",
          onAction: () =>
            act(
              { action: "AUTHORISE" },
              "Repair authorised. The Foreman has been told to assign somebody.",
            ),
        },
    ASSIGN: data.assignedToName
      ? { ref: data.assignedToName }
      : { onAction: () => setAssignOpen(true), actionLabel: "Assign a technician" },
    WORK_ORDER: data.workOrder
      ? { ref: data.workOrder.workOrderNumber, href: `/work-orders/${data.workOrder.id}` }
      : {
          actionLabel: "Raise the work order",
          onAction: async () => {
            const d = await act({ action: "RAISE_WORK_ORDER" }, "Work order raised for this repair.");
            if (d?.workOrderId) window.location.href = `/work-orders/${d.workOrderId}`;
          },
        },
    WMS: data.wms
      ? {
          ref: data.wms.wmsNumber,
          href: `/wms/${data.wms.id}`,
          waitingOn:
            data.wms.status !== "APPROVED"
              ? `${data.wms.wmsNumber} is written but not approved yet.`
              : undefined,
        }
      : data.workOrder
        ? { actionHref: `/wms/new?workOrderId=${data.workOrder.id}` }
        : { waitingOn: "The work order has to exist first." },
    JHA: data.jha
      ? {
          ref: data.jha.jhaNumber,
          href: `/jha/${data.jha.id}`,
          waitingOn:
            data.jha.status !== "APPROVED"
              ? `${data.jha.jhaNumber} is raised but not approved yet.`
              : undefined,
        }
      : data.wms?.status === "APPROVED"
        ? { actionHref: `/jha/new?wmsId=${data.wms.id}` }
        : { waitingOn: "The method statement has to be approved first." },
    PERMIT: data.permit
      ? { ref: data.permit.permitNumber, href: `/permits/${data.permit.id}` }
      : data.jha?.status === "APPROVED"
        ? { actionHref: `/permits/new?jhaId=${data.jha.id}` }
        : { waitingOn: "The hazard analysis has to be approved first." },
    WORK: {
      waitingOn: data.permit ? undefined : "No permit, no repair work.",
      actionLabel: "Record the repair and the parts used below",
    },
  };

  return (
    <div className="space-y-3">
      <FlowRail flow={data.flow} role={role} links={links} title="Where this repair is" />

      {assignOpen && canAssign && (
        <div className="bg-surface border border-line rounded-xl shadow-card p-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="text-xs font-medium text-ink-700 block mb-1">Assign the repair to</label>
            <Select value={person} onChange={setPerson} ariaLabel="Assignee" className="w-full">
              <option value="">Choose a person</option>
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            loading={busy}
            disabled={!person}
            onClick={() =>
              act(
                { action: "ASSIGN", assignedToId: person },
                "Assigned. They have been told, and they raise the work order.",
              )
            }
          >
            Assign
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
    </div>
  );
}
