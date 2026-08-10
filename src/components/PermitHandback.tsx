// src/components/PermitHandback.tsx
// The three blocks at the foot of the paper permit: HANDOVER OF WORK, HANDBACK
// OF WORK and WORK ACCEPTANCE CLOSURE OF PERMIT.
//
// Handback is a statement of what state the job was left in. It does not close
// the permit, the close-out signatures do. Keeping the two apart is the point:
// a permit closed on one person saying "finished" is the failure mode the
// signature chain exists to prevent.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, PauseCircle, ArrowRightLeft, Stamp } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import Select from "./Select";
import { FIELD_CLASS, LABEL_CLASS } from "./Field";
import { formatDate } from "@/lib/utils";

type Handover = { from: string; to: string; at: string };

export default function PermitHandback({
  permit,
  canHandback,
  canAccept,
  onSaved,
}: {
  permit: {
    id: string;
    permitNumber: string;
    handbackOutcome: string | null;
    handbackReason: string | null;
    handbackByName: string | null;
    handbackAt: string | null;
    handovers: string | null;
    acceptedByName: string | null;
    acceptedByDept: string | null;
    acceptedAt: string | null;
    closureNote: string | null;
  };
  canHandback: boolean;
  canAccept: boolean;
  onSaved: () => void;
}) {
  const [handbackOpen, setHandbackOpen] = useState(false);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [outcome, setOutcome] = useState<"COMPLETED" | "SUSPENDED">("COMPLETED");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dept, setDept] = useState("");
  const [saving, setSaving] = useState(false);

  const handovers: Handover[] = (() => {
    try {
      const p = JSON.parse(permit.handovers ?? "[]");
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  })();

  const post = async (body: Record<string, unknown>, method: "POST" | "PUT" = "POST") => {
    setSaving(true);
    try {
      const res = await fetch(`/api/permits/${permit.id}/handback`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not save.");
        return false;
      }
      onSaved();
      return true;
    } finally {
      setSaving(false);
    }
  };

  const submitHandback = async () => {
    const ok = await post({ action: "handback", outcome, reason: reason.trim() });
    if (ok) {
      toast.success(
        outcome === "COMPLETED"
          ? "Job handed back complete. The close-out signatures still close the permit."
          : "Job recorded as suspended.",
      );
      setHandbackOpen(false);
      setReason("");
    }
  };

  const submitHandover = async () => {
    const ok = await post({ from: from.trim(), to: to.trim() }, "PUT");
    if (ok) {
      toast.success(`Handed over from ${from} to ${to}.`);
      setHandoverOpen(false);
      setFrom("");
      setTo("");
    }
  };

  const submitAccept = async () => {
    const ok = await post({ action: "accept", dept: dept.trim() });
    if (ok) {
      toast.success("Job accepted as stated.");
      setDept("");
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <h3 className="text-sm font-semibold text-slate-900">Handover, handback and acceptance</h3>

      {/* Handover of work */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Handover of work
          </h4>
          {canHandback && (
            <Button
              type="button"
              variant="secondary"
              icon={ArrowRightLeft}
              onClick={() => setHandoverOpen(true)}
            >
              Record handover
            </Button>
          )}
        </div>
        {handovers.length === 0 ? (
          <p className="text-xs text-slate-400">The permit has not changed hands.</p>
        ) : (
          <ul className="text-xs text-slate-700 space-y-1">
            {handovers.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-slate-400">{i + 1}</span>
                <span className="font-medium">{h.from}</span>
                <ArrowRightLeft className="w-3 h-3 text-slate-400" />
                <span className="font-medium">{h.to}</span>
                <span className="text-slate-400">{formatDate(h.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Handback of work */}
      <div className="pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Handback of work
          </h4>
          {canHandback && (
            <Button
              type="button"
              variant="secondary"
              icon={permit.handbackOutcome ? PauseCircle : CheckCircle2}
              onClick={() => {
                setOutcome((permit.handbackOutcome as "COMPLETED" | "SUSPENDED") ?? "COMPLETED");
                setReason(permit.handbackReason ?? "");
                setHandbackOpen(true);
              }}
            >
              {permit.handbackOutcome ? "Update handback" : "Hand back"}
            </Button>
          )}
        </div>
        {permit.handbackOutcome ? (
          <div className="text-xs">
            <p className="text-slate-900 font-medium">
              {permit.handbackOutcome === "COMPLETED"
                ? "Job completed and worksite cleared"
                : "Job suspended"}
            </p>
            {permit.handbackReason && (
              <p className="text-slate-600 mt-0.5 whitespace-pre-line">{permit.handbackReason}</p>
            )}
            <p className="text-slate-400 mt-0.5">
              {permit.handbackByName ?? "-"} · {formatDate(permit.handbackAt)}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">The work party has not handed the job back yet.</p>
        )}
      </div>

      {/* Work acceptance closure */}
      <div className="pt-4 border-t border-slate-200">
        <div className="flex items-center justify-between gap-3 mb-2">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Work acceptance
          </h4>
          {canAccept && !permit.acceptedAt && permit.handbackOutcome && (
            <div className="flex items-center gap-2">
              <input
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                placeholder="Dept."
                className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
              />
              <Button type="button" icon={Stamp} loading={saving} onClick={submitAccept}>
                Accept
              </Button>
            </div>
          )}
        </div>
        {permit.acceptedAt ? (
          <p className="text-xs text-slate-700">
            Job accepted as stated by{" "}
            <span className="font-medium text-slate-900">{permit.acceptedByName ?? "-"}</span>
            {permit.acceptedByDept && ` (${permit.acceptedByDept})`} on {formatDate(permit.acceptedAt)}.
          </p>
        ) : (
          <p className="text-xs text-slate-400">
            {permit.handbackOutcome
              ? "Waiting on the asset holder to accept the job."
              : "Acceptance follows handback."}
          </p>
        )}
      </div>

      {permit.closureNote && (
        <div className="pt-4 border-t border-slate-200">
          <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
            Closure
          </h4>
          <p className="text-xs text-slate-700">{permit.closureNote}</p>
        </div>
      )}

      <Modal
        open={handbackOpen}
        onClose={() => setHandbackOpen(false)}
        title="Hand the work back"
        subtitle={`${permit.permitNumber} · this states the site condition, the close-out signatures still close the permit`}
      >
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Outcome</label>
            <Select
              value={outcome}
              onChange={(v) => setOutcome(v as "COMPLETED" | "SUSPENDED")}
              className="w-full"
            >
              <option value="COMPLETED">The job is completed and worksite cleared</option>
              <option value="SUSPENDED">The job is suspended</option>
            </Select>
          </div>
          {outcome === "SUSPENDED" && (
            <div>
              <label className={LABEL_CLASS}>Why, and what state was it left in?</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="Isolation still on, guard removed, parts awaited, whatever the next person needs to know"
                className={FIELD_CLASS}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setHandbackOpen(false)}>
              Cancel
            </Button>
            <Button type="button" loading={saving} onClick={submitHandback}>
              Record handback
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={handoverOpen}
        onClose={() => setHandoverOpen(false)}
        title="Hand the permit over"
        subtitle="The permit passing between two people mid-job"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS}>From</label>
              <input value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD_CLASS} />
            </div>
            <div>
              <label className={LABEL_CLASS}>To</label>
              <input value={to} onChange={(e) => setTo(e.target.value)} className={FIELD_CLASS} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setHandoverOpen(false)}>
              Cancel
            </Button>
            <Button type="button" loading={saving} onClick={submitHandover}>
              Record handover
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
