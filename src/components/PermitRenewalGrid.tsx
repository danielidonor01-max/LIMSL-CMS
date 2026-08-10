// src/components/PermitRenewalGrid.tsx
// The VALIDITY & RENEWAL block from the permit face: one column per day of the
// validity period, with date, time and signature.
//
// Days not worked are struck through, exactly as on paper, and the weekend gets
// a column like any other day. A day that has passed with nothing recorded is
// shown as a gap rather than as a day off, because on the paper form it is
// obvious that a column was skipped and here it would not be.
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PenLine, CalendarDays } from "lucide-react";
import Modal from "./Modal";
import Button from "./Button";
import SignaturePad from "./SignaturePad";
import Select from "./Select";
import { FIELD_CLASS, LABEL_CLASS } from "./Field";
import type { RenewalDay, RenewalSummary } from "@/lib/hse/permit-validity";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const dayName = (iso: string) => DAY_NAMES[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? "";

export default function PermitRenewalGrid({
  permitId,
  days,
  marks,
  summary,
  canRenew,
  onSaved,
}: {
  permitId: string;
  days: string[];
  marks: Record<string, RenewalDay>;
  summary: RenewalSummary;
  canRenew: boolean;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<"WORKED" | "NOT_WORKED">("WORKED");
  const [time, setTime] = useState("08:00");
  const [signature, setSignature] = useState<string | null>(null);
  const [amendReason, setAmendReason] = useState("");
  const [saving, setSaving] = useState(false);

  const openDay = (date: string) => {
    const existing = marks[date];
    setStatus(existing?.status ?? "WORKED");
    setTime(existing?.time ?? "08:00");
    setSignature(null);
    setAmendReason("");
    setOpen(date);
  };

  const submit = async () => {
    if (!open) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/permits/${permitId}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: open,
          status,
          time: status === "WORKED" ? time : null,
          signatureData: status === "WORKED" ? signature : null,
          amendReason: amendReason.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || "Could not record the day.");
        return;
      }
      toast.success(
        status === "WORKED" ? `${open} recorded as worked from ${time}.` : `${open} struck as not worked.`,
      );
      setOpen(null);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const existing = open ? marks[open] : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-emerald-600" /> Validity and renewal
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {summary.expired
              ? `Expired after ${summary.expiresOn}.`
              : `${summary.daysRemaining} day${summary.daysRemaining === 1 ? "" : "s"} left, expires after ${summary.expiresOn}.`}
            {" "}
            {summary.worked} worked, {summary.notWorked} not worked.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <tbody>
            <tr className="border-b border-slate-100">
              <th className="text-left font-semibold text-slate-500 py-2 px-3 w-20 bg-slate-50">Date</th>
              {days.map((d) => {
                const mark = marks[d];
                const struck = mark?.status === "NOT_WORKED";
                return (
                  <td
                    key={d}
                    className={`py-2 px-2 text-center border-l border-slate-100 ${
                      d === today ? "bg-emerald-50" : ""
                    }`}
                  >
                    <span className={struck ? "line-through text-slate-400" : "text-slate-900 font-medium"}>
                      {d.slice(8)}/{d.slice(5, 7)}
                    </span>
                    <span className="block text-[9px] text-slate-400">{dayName(d)}</span>
                  </td>
                );
              })}
            </tr>
            <tr className="border-b border-slate-100">
              <th className="text-left font-semibold text-slate-500 py-2 px-3 bg-slate-50">Time</th>
              {days.map((d) => {
                const mark = marks[d];
                return (
                  <td key={d} className="py-2 px-2 text-center border-l border-slate-100 text-slate-700">
                    {mark?.status === "WORKED" ? mark.time : mark?.status === "NOT_WORKED" ? "—" : ""}
                  </td>
                );
              })}
            </tr>
            <tr>
              <th className="text-left font-semibold text-slate-500 py-2 px-3 bg-slate-50">Sign</th>
              {days.map((d) => {
                const mark = marks[d];
                const past = d <= today;
                return (
                  <td key={d} className="py-2 px-2 text-center border-l border-slate-100 align-middle">
                    {mark?.status === "WORKED" && mark.signatureData ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mark.signatureData}
                        alt={`Signed for ${d}`}
                        title={`${mark.signedByName ?? ""} ${mark.time ?? ""}`}
                        className="h-7 mx-auto"
                      />
                    ) : mark?.status === "NOT_WORKED" ? (
                      <span className="block text-slate-300 text-lg leading-none" title="Not worked">
                        ／
                      </span>
                    ) : canRenew && past ? (
                      <button
                        type="button"
                        onClick={() => openDay(d)}
                        className="text-emerald-600 hover:text-emerald-700"
                        aria-label={`Record ${d}`}
                      >
                        <PenLine className="w-4 h-4 mx-auto" />
                      </button>
                    ) : (
                      <span className="text-slate-200">·</span>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {summary.unaccounted.length > 0 && (
        <div className="px-6 py-3 bg-amber-50 border-t border-amber-200">
          <p className="text-[11px] text-amber-800">
            {summary.unaccounted.length} day
            {summary.unaccounted.length === 1 ? " has" : "s have"} passed with nothing recorded:{" "}
            {summary.unaccounted.join(", ")}. Mark each one worked or not worked, a blank column is a
            gap in the evidence rather than a day off.
          </p>
        </div>
      )}

      {canRenew && marks && (
        <div className="px-6 py-3 border-t border-slate-200 flex flex-wrap gap-1.5">
          {days
            .filter((d) => d <= today && marks[d])
            .map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => openDay(d)}
                className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 underline"
              >
                Amend {d}
              </button>
            ))}
        </div>
      )}

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open ? `Record ${open}` : ""}
        subtitle={existing ? "This day is already recorded. Changing it needs a reason." : undefined}
      >
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLASS}>Was work done on this day?</label>
            <Select
              value={status}
              onChange={(v) => setStatus(v as "WORKED" | "NOT_WORKED")}
              className="w-full"
            >
              <option value="WORKED">Yes, work was carried out</option>
              <option value="NOT_WORKED">No, the day is struck</option>
            </Select>
          </div>

          {status === "WORKED" && (
            <>
              <div>
                <label className={LABEL_CLASS}>Time work started</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className={FIELD_CLASS}
                />
              </div>
              <SignaturePad label="Asset Holder Supervisor signature" onChange={setSignature} />
            </>
          )}

          {existing && (
            <div>
              <label className={LABEL_CLASS}>Reason for the correction</label>
              <textarea
                value={amendReason}
                onChange={(e) => setAmendReason(e.target.value)}
                rows={2}
                placeholder="Why the recorded day is being changed"
                className={FIELD_CLASS}
              />
              <p className="text-[10px] text-slate-500 mt-1">
                The previous entry is kept on the record, as a struck-through correction would be on
                paper.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button type="button" icon={PenLine} loading={saving} onClick={submit}>
              Record day
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
