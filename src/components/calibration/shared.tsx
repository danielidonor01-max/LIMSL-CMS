// src/components/calibration/shared.tsx
// What the three tabs of the calibration module have in common: how a due date
// reads, and how a certificate gets from someone's phone into storage.
"use client";

import { Badge } from "@/components/Badge";
import { AlertTriangle } from "lucide-react";
import type { DueState } from "@/lib/premob-verification";

export const DUE_BADGE: Record<DueState, string> = {
  CURRENT: "bg-brand-500/10 text-brand-700 border-brand-500/20",
  DUE_SOON: "bg-warn-500/10 text-warn-700 border-warn-500/20",
  OVERDUE: "bg-danger-500/10 text-danger-700 border-danger-500/20",
  NONE: "bg-ink-500/10 text-ink-600 border-ink-500/20",
};

export function DueBadge({ state, noneLabel = "None on record" }: { state: DueState; noneLabel?: string }) {
  const label = { CURRENT: "Current", DUE_SOON: "Due soon", OVERDUE: "Overdue", NONE: noneLabel }[state];
  return <Badge className={DUE_BADGE[state]}>{label}</Badge>;
}

export function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const today = new Date().toISOString().slice(0, 10);
  return Math.round(
    (new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 864e5,
  );
}

export function DaysHint({ iso }: { iso: string | null | undefined }) {
  const d = daysFromToday(iso);
  if (d === null) return null;
  return (
    <span className={`ml-1 ${d < 0 ? "text-danger-700" : d <= 30 ? "text-warn-700" : "text-ink-500"}`}>
      ({d < 0 ? `${-d}d ago` : d === 0 ? "today" : `${d}d`})
    </span>
  );
}

// The file goes up first and the record carries its key. Two requests rather
// than one multipart form, because /api/files is the one place that knows the
// storage limits and allowed types, and a second upload path would drift.
export async function uploadProof(file: File): Promise<{ key: string; name: string; mimeType: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/files", { method: "POST", body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Upload failed.");
  return { key: json.key, name: json.name, mimeType: json.mimeType };
}

export const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx";
export const FILE_CLASS =
  "w-full text-xs text-ink-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-ink-200 file:text-ink-700 file:text-xs file:font-semibold";

export function SetupNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-warn-200 bg-warn-50 text-warn-800 text-xs">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
      <span>
        This register is not switched on for this database yet. An administrator runs{" "}
        <span className="font-semibold">apply-premob-verification</span> once; until then records cannot be
        saved.
      </span>
    </div>
  );
}
