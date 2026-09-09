// src/components/EmptyState.tsx
// Twenty-two pages wrote their own one-line "nothing here" string at four
// different paddings and two text sizes, none with an icon or a way forward.
// An empty state should say what would be here, why it isn't, and what to do,
// especially when the reason is a filter the user can clear.
//
// Restrained on purpose. The icon is bare rather than sitting in a rounded
// tinted chip: the chip is the default every Tailwind app ships with, and it
// dresses up a moment that should be quiet. One sentence, one action.
//
// The important rule is `blockedBy`. Some screens are empty because of a
// prerequisite somewhere else: a hazard analysis needs an approved method
// statement, a permit needs an approved analysis. Offering "New Analysis" there
// is an invitation to a dead end, and the person who follows it learns the
// button lies. Where something has to happen first, say what it is and point at
// it instead.
"use client";

import Link from "next/link";
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
  blockedBy,
}: {
  icon?: React.ElementType;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  // What has to exist before anything can be created here, and where to go and
  // make it. Suppresses the primary action, because it would not work.
  blockedBy?: { label: string; href: string };
}) {
  return (
    <div className="py-16 px-6 flex flex-col items-center justify-center text-center">
      <Icon className="w-8 h-8 text-ink-300" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-base font-semibold text-ink-800 mt-4">{title}</p>
      {message && <p className="text-sm text-ink-500 mt-1.5 max-w-sm leading-relaxed">{message}</p>}

      {blockedBy ? (
        <Link
          href={blockedBy.href}
          className="mt-5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          {blockedBy.label}
        </Link>
      ) : (
        (actionLabel || secondaryLabel) && (
          <div className="flex items-center gap-2 flex-wrap justify-center mt-5">
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
        )
      )}
    </div>
  );
}
