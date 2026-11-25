// src/lib/maintenance/cm-lock.ts
// When a breakdown record stops being editable.
//
// The first signature ("Repaired by") is refused until the record carries its
// failure mode, root cause and downtime window, so by then the record is the
// thing being signed for. After it, a value that is already there cannot be
// changed: the downtime window drives MTTR, and the root cause is what the
// Foreman and Maintenance Manager put their names to. A blank may still be
// filled in, because records signed under the old flow, before those fields
// were required, close by having their missing dates saved.
//
// A closed record changes in nothing but its follow-up actions. Those are
// tracked to completion after close-out by design (ISO 9001 10.2), and every
// change to them is in the audit log.
import { isBlank, type FieldChange } from "@/lib/audit-diff";

export const CM_FOLLOW_UP_FIELDS = ["correctiveActions", "preventiveActions"];

// Derived on the server, never typed: they follow the fields they come from.
const DERIVED = ["totalDowntimeHours", "technicianName", "technicianId", "supervisorName", "supervisorId", "status", "closeOutDate", "restoredToServiceTime"];

const LABELS: Record<string, string> = {
  faultType: "the fault type",
  urgency: "the urgency",
  faultDescription: "the fault description",
  observedFault: "the observed fault",
  downStartAt: "when the machine went down",
  downEndAt: "when it was restored",
  failureMode: "the failure mode",
  detectionMethod: "how it was detected",
  verifiedRootCause: "the verified root cause",
  rootCauseCategory: "the root cause category",
  rcaAnalysis: "the root cause analysis",
  rcaTool: "the analysis method",
  assignedToId: "who it is assigned to",
  assignedToName: "who it is assigned to",
  repairStatus: "the repair outcome",
  partsReplaced: "the parts replaced",
};

export function cmFieldLabel(key: string) {
  return LABELS[key] ?? key.replace(/([A-Z])/g, " $1").toLowerCase();
}

/** The fields this edit may not make, given how far the record has got. */
export function cmLockedChanges(
  changes: Record<string, FieldChange>,
  state: { signed: boolean; closed: boolean },
): string[] {
  if (!state.signed && !state.closed) return [];
  return Object.entries(changes)
    .filter(([key]) => !CM_FOLLOW_UP_FIELDS.includes(key) && !DERIVED.includes(key))
    .filter(([, c]) => state.closed || !isBlank(c.from))
    .map(([key]) => key);
}

export function cmLockMessage(fields: string[], state: { closed: boolean; reference: string }) {
  const named = [...new Set(fields.map(cmFieldLabel))];
  const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}` : named[0];
  return state.closed
    ? `${state.reference} is closed. Only its follow-up actions can still be updated, so ${list} cannot change.`
    : `${state.reference} has been signed, so ${list} cannot change. If something on it is wrong, note the correction in the comments when signing.`;
}
