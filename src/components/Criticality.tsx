// src/components/Criticality.tsx
// How critical a machine is, shown so that it carries information.
//
// The registry rendered every row's criticality as a badge, and almost every
// machine is MEDIUM, so the column was a wall of identical pills. A badge that
// says the same thing on every row is not a signal, it is texture: the eye
// learns to skip it, and then skips it on the row where it says CRITICAL.
//
// Badges are reserved for the values that should stop someone. The ordinary
// ones are still shown, because the column is not empty and the data is real,
// but as quiet text that recedes.
"use client";

import { Badge } from "./Badge";
import { CRITICALITY_BADGE, CRITICALITY_SHORT } from "@/lib/constants";

const RAISED = new Set(["HIGH", "CRITICAL"]);

export default function Criticality({ value }: { value: string | null | undefined }) {
  const key = value ?? "MEDIUM";
  const label = CRITICALITY_SHORT[key] ?? "Medium";

  if (!RAISED.has(key)) {
    return <span className="text-xs text-ink-500">{label}</span>;
  }

  return <Badge className={CRITICALITY_BADGE[key] ?? CRITICALITY_BADGE.MEDIUM}>{label}</Badge>;
}
