// src/components/SegmentedControl.tsx
// The second control this app kept reinventing.
//
// Tabs.tsx settled how you move between VIEWS of a page. It did not settle the
// other thing: a short, mutually exclusive set of filters or display modes that
// sits beside a toolbar rather than above the content — the asset-type filter on
// the register, the category filter on notifications, list-versus-calendar on
// the schedule, week/month/quarter on the calendar, the entity picker on data
// import, the drill filter on emergency preparedness.
//
// Six pages, six private copies, and they had already drifted: three heights,
// two label sizes, and `capitalize` standing in for a real label in one of them.
// Worse, the tabs guard could not see any of them — its regex expected the
// classes in the order the first offender happened to write them, and every one
// of these six wrote `rounded-lg p-1` rather than `p-1 … rounded-lg`, so the
// ratchet read clean while the pattern spread. The guard is tightened alongside
// this.
//
// A real radiogroup, not a row of buttons that look like one: arrows move the
// selection, Home and End jump to the ends, and only the selected segment is in
// the tab order — which is what a keyboard user expects from a control where
// exactly one option is always chosen.
"use client";

import { useId, useRef } from "react";
import { m, useReducedMotion } from "motion/react";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  /** A figure alongside the label, e.g. how many rows the filter would show. */
  count?: number;
  /** Long-form explanation, shown natively on hover. */
  title?: string;
  icon?: React.ElementType;
};

export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  // Per instance, not per label, for the same reason as Tabs: a shared id
  // lets the highlight leave one control and land in another.
  const highlightId = useId();

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = options.findIndex((o) => o.value === value);
    if (i === -1) return;
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;

    e.preventDefault();
    onChange(options[next].value);
    // Focus follows the selection, or the keyboard user is left standing on the
    // segment they just moved away from.
    ref.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`inline-flex flex-wrap gap-1 bg-ink-100 border border-line rounded-lg p-1 w-fit ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`relative inline-flex items-center gap-1.5 px-3 min-h-9 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              active ? "text-brand-700" : "text-ink-600 hover:text-ink-900"
            }`}
          >
            {active && (
              <m.span
                layoutId={highlightId}
                aria-hidden="true"
                className="absolute inset-0 bg-surface rounded-lg shadow-card border border-line/40"
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 450, damping: 32 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
              {o.label}
              {o.count !== undefined && (
                <span className="tabular-nums font-normal text-ink-500">
                  {o.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
