// src/lib/hse/permit-cancel.ts
// Why a permit was withdrawn (LIMSL, 16 Nov 2026). A permit is cancelled so
// the paperwork behind it can be put right and the permit reissued, so the
// reason names WHICH document has the problem: the person correcting it and
// the person reissuing both start from this line.
export const CANCEL_REASONS = [
  { value: "JHA", label: "A problem in the Job Hazard Analysis" },
  { value: "WMS", label: "A problem in the Work Method Statement" },
  { value: "OTHER", label: "Something else (the work, the scope, the window)" },
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number]["value"];

const SHORT: Record<string, string> = { JHA: "JHA needs correcting", WMS: "WMS needs correcting", OTHER: "Withdrawn" };

// The note stored on the permit, readable on its own: "JHA needs correcting: …".
export function cancelNote(reason: string, note: string): string {
  return `${SHORT[reason] ?? "Withdrawn"}: ${note.trim().slice(0, 500)}`;
}

// Read the reason back from a stored note, for the permit page's next steps.
export function cancelReasonOf(closureNote: string | null | undefined): CancelReason | null {
  if (!closureNote) return null;
  if (closureNote.startsWith(SHORT.JHA)) return "JHA";
  if (closureNote.startsWith(SHORT.WMS)) return "WMS";
  if (closureNote.startsWith(SHORT.OTHER)) return "OTHER";
  return null;
}
