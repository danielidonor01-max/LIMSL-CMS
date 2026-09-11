// src/components/Tabs.tsx
// One way to switch between views.
//
// There were four. A pill inside a grey track on the hazard analysis list, a
// tinted pill on the schedule, a filled brand button in settings, and an
// underline on the equipment record. Same control, same job, four appearances,
// so moving between two pages made the app feel like two applications.
//
// The underline wins because it is the one that does not compete. A filled or
// tinted pill puts a block of colour beside the page's real actions, and the
// eye reads it as something to press rather than as a marker of where it
// already is. An underline states position and then gets out of the way.
//
// Built as a real tablist: arrow keys move between tabs, Home and End jump to
// the ends, and only the selected tab is in the tab order, which is what a
// screen reader and a keyboard user expect from tabs rather than from a row of
// buttons that happen to look like them.
"use client";

import { useRef } from "react";

export type TabItem<T extends string> = {
  value: T;
  label: string;
  // A figure alongside the label, e.g. how many are overdue. Rendered muted so
  // it informs without turning the tab into a badge.
  count?: number;
};

export default function Tabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = items.findIndex((t) => t.value === value);
    if (i === -1) return;
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    else return;

    e.preventDefault();
    onChange(items[next].value);
    // Move focus with the selection, or the keyboard user is left behind on the
    // tab they came from.
    const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`flex items-center gap-6 border-b border-line ${className}`}
    >
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={`relative -mb-px flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm transition-colors ${
 active
 ? "border-brand-600 text-ink-900 font-semibold"
 : "border-transparent text-ink-500 font-medium hover:text-ink-900"
 }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`text-xs tabular-nums ${active ? "text-ink-500" : "text-ink-400"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
