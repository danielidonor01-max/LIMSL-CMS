// src/components/ai/TaskList.tsx
// The assistant's suggested checks as a list you work through: tick a row and
// the circle fills, the label is struck through, the row gives a small nudge,
// and it moves down below the checks still to do.
//
// Adapted from Rare UI's Task list (https://rareui.com/components/tasklist),
// Copyright (c) 2026 Swami Malode, MIT + Commons Clause + Attribution. Ported
// to this app's tokens, with a second line for what to expect.
"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { m, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;
const FILL: Transition = { duration: 0.24, ease: EASE_OUT };
const POP: Transition = { duration: 0.34, ease: EASE_OUT, times: [0, 0.4, 1] };
const TICK: Transition = { duration: 0.22, ease: EASE_OUT, delay: 0.06 };
const STRIKE: Transition = { duration: 0.38, ease: EASE_IN_OUT };
const NUDGE: Transition = { duration: 0.3, ease: EASE_OUT, times: [0, 0.35, 0.7, 1] };
const REORDER: Transition = { type: "spring", stiffness: 320, damping: 30 };
const INSTANT: Transition = { duration: 0 };

// Dashes divide the circumference, so the ring closes without a seam.
const RING_R = 11;
const RING_DASH = `1 ${(2 * Math.PI * RING_R) / 13 - 1}`;

// The strike rides on the text itself, so a label that wraps gets a line per row.
const STRIKE_STYLE: CSSProperties = {
  backgroundImage: "linear-gradient(currentColor, currentColor)",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "0 55%",
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
};

type Stage = "idle" | "tick" | "strike" | "nudge" | "settled" | "unstrike" | "untick";
const FILLED: Stage[] = ["tick", "strike", "nudge", "settled", "unstrike"];
const STRUCK: Stage[] = ["strike", "nudge", "settled"];

function useTiming() {
  const reduced = useReducedMotion() ?? false;
  return (t: Transition) => (reduced ? INSTANT : t);
}

export type Task = { id: string; label: string; detail?: string; done?: boolean };

export function TaskItem({
  label,
  detail,
  checked,
  disabled = false,
  onCheckedChange,
  onSettled,
  onReverted,
  className,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onSettled?: () => void;
  onReverted?: () => void;
  className?: string;
}) {
  const timing = useTiming();
  const [stage, setStage] = useState<Stage>(checked ? "settled" : "idle");
  const [was, setWas] = useState(checked);

  // Turn around in the same render the tick flips, so the row never paints stale.
  if (was !== checked) {
    setWas(checked);
    setStage(checked ? "tick" : "unstrike");
  }

  const onDrawn = () => {
    if (stage === "tick") setStage("strike");
    if (stage === "untick") {
      setStage("idle");
      onReverted?.();
    }
  };
  const onStruck = () => {
    if (stage === "strike") setStage("nudge");
    if (stage === "unstrike") setStage("untick");
  };
  const onFlicked = () => {
    if (stage !== "nudge") return;
    setStage("settled");
    onSettled?.();
  };

  const filled = FILLED.includes(stage);
  const struck = STRUCK.includes(stage);

  return (
    <m.button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      animate={{ x: stage === "nudge" ? [0, 8, -2, 0] : 0 }}
      transition={stage === "nudge" ? timing(NUDGE) : INSTANT}
      onAnimationComplete={onFlicked}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        checked ? "border-line bg-ink-50" : "border-line bg-surface shadow-card hover:border-ink-300",
        disabled ? "cursor-default" : "cursor-pointer",
        className,
      )}
    >
      <m.svg
        viewBox="0 0 24 24"
        aria-hidden
        className="mt-px h-5 w-5 shrink-0 text-ink-300"
        initial={false}
        animate={{ scale: filled ? [1, 1.08, 1] : 1 }}
        transition={filled ? timing(POP) : INSTANT}
      >
        <m.circle
          cx="12"
          cy="12"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_DASH}
          initial={false}
          animate={{ opacity: filled ? 0 : 1 }}
          transition={timing(FILL)}
        />
        <m.circle
          cx="12"
          cy="12"
          r="12"
          fill="var(--color-brand-600)"
          style={{ transformBox: "view-box", transformOrigin: "12px 12px" }}
          initial={false}
          animate={{ scale: filled ? 1 : 0 }}
          transition={timing(FILL)}
        />
        <m.path
          d="M7.4 12.4 10.6 15.5 16.6 8.9"
          fill="none"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: filled ? 1 : 0, opacity: filled ? 1 : 0 }}
          transition={timing(TICK)}
          onAnimationComplete={onDrawn}
        />
      </m.svg>
      <span className="min-w-0 flex-1">
        <m.span
          style={STRIKE_STYLE}
          className={cn(
            "text-sm leading-5 font-medium transition-colors duration-300",
            struck ? "text-ink-400" : "text-ink-800",
          )}
          initial={false}
          animate={{ backgroundSize: `${struck ? 100 : 0}% 1.5px` }}
          transition={timing(STRIKE)}
          onAnimationComplete={onStruck}
        >
          {label}
        </m.span>
        {detail && (
          <span className={cn("mt-0.5 block text-xs leading-relaxed", struck ? "text-ink-400" : "text-ink-500")}>
            {detail}
          </span>
        )}
      </span>
    </m.button>
  );
}

export default function TaskList({
  tasks,
  onToggle,
  disabled = false,
  className,
}: {
  tasks: Task[];
  onToggle?: (id: string, done: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const timing = useTiming();
  const [parked, setParked] = useState<string[]>(() => tasks.filter((t) => t.done).map((t) => t.id));
  const [announcement, setAnnouncement] = useState("");

  // A parked row that is no longer done, or gone, was changed from outside.
  const finished = parked
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is Task => t?.done === true);
  const open = tasks.filter((t) => !finished.includes(t));

  return (
    <ul className={cn("flex w-full flex-col gap-2", className)}>
      {[...open, ...finished].map((task) => (
        <m.li key={task.id} layout transition={timing(REORDER)}>
          <TaskItem
            label={task.label}
            detail={task.detail}
            checked={!!task.done}
            disabled={disabled}
            onCheckedChange={(done) => {
              onToggle?.(task.id, done);
              setAnnouncement(`${task.label} ${done ? "done" : "reopened"}`);
            }}
            onSettled={() => setParked((ids) => (ids.includes(task.id) ? ids : [...ids, task.id]))}
            onReverted={() => setParked((ids) => ids.filter((id) => id !== task.id))}
          />
        </m.li>
      ))}
      <li role="status" aria-live="polite" className="sr-only">
        {announcement}
      </li>
    </ul>
  );
}
