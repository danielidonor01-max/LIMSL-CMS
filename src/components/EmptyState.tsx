// src/components/EmptyState.tsx
// Twenty-two pages wrote their own one-line "nothing here" string at four
// different paddings and two text sizes, none with an icon or a way forward.
// An empty state should say what would be here, why it isn't, and what to do —
// especially when the reason is a filter the user can clear.
"use client";

import { Inbox } from "lucide-react";
import Button from "@/components/Button";

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  message,
  actionLabel,
  onAction,
  actionHref,
  secondaryLabel,
  onSecondary,
}: {
  icon?: React.ElementType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="py-14 px-6 flex flex-col items-center justify-center text-center gap-3">
      <div className="p-3 rounded-xl bg-slate-50 text-slate-400 border border-slate-200">
        <Icon className="w-6 h-6" />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {message && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{message}</p>}
      </div>
      {(actionLabel || secondaryLabel) && (
        <div className="flex items-center gap-2 flex-wrap justify-center pt-1">
          {actionLabel && (
            <Button size="sm" href={actionHref} onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondaryLabel && (
            <Button size="sm" variant="secondary" onClick={onSecondary}>
              {secondaryLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
