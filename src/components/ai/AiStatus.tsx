// src/components/ai/AiStatus.tsx
// What the assistant is doing while you wait, as one quiet line: an animated
// glyph, a label with a shimmer, and the seconds it has been at it. When the
// reply lands it settles to "Worked for 7s".
//
// Adapted from Rare UI's Inline AI Status (https://rareui.com/components/aistatus),
// Copyright (c) 2026 Swami Malode, MIT + Commons Clause + Attribution. Ported
// to this app's tokens: ink for the text, violet for the AI identity, no
// external measuring hook.
"use client";

import { AnimatePresence, m, useReducedMotion, type Transition, type Variants } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type AiStatusState = "thinking" | "researching" | "analyzing" | "writing" | "done" | "error";

const ACTIVE: Record<AiStatusState, boolean> = {
  thinking: true,
  researching: true,
  analyzing: true,
  writing: true,
  done: false,
  error: false,
};

const SPARKLE_PATH = "M11 5Q12 12 19 13Q12 14 11 21Q10 14 3 13Q10 12 11 5Z";
const TWINKLE_PATH = "M18 2Q18.4 4.6 21 5Q18.4 5.4 18 8Q17.6 5.4 15 5Q17.6 4.6 18 2Z";
const PEN_PATH =
  "M3.78181 16.3092L3 21L7.69086 20.2182C8.50544 20.0825 9.25725 19.6956 9.84119 19.1116L20.4198 8.53288C21.1934 7.75922 21.1934 6.5049 20.4197 5.73126L18.2687 3.58024C17.495 2.80658 16.2406 2.80659 15.4669 3.58027L4.88841 14.159C4.30447 14.7429 3.91757 15.4947 3.78181 16.3092Z";

const SWAP: Transition = { type: "spring", duration: 0.5, bounce: 0.15 };
const ICON: Transition = { type: "spring", duration: 0.55, bounce: 0.35 };
const INSTANT: Transition = { duration: 0 };
const LOOP = { repeat: Infinity, ease: "easeInOut" } as const;

const swapVariants: Variants = {
  enter: { y: 8, opacity: 0, filter: "blur(4px)" },
  center: { y: 0, opacity: 1, filter: "blur(0px)" },
  exit: { y: -8, opacity: 0, filter: "blur(4px)" },
};
const iconVariants: Variants = {
  enter: { scale: 0.5, opacity: 0, rotate: -30, filter: "blur(4px)" },
  center: { scale: 1, opacity: 1, rotate: 0, filter: "blur(0px)" },
  exit: { scale: 0.5, opacity: 0, rotate: 30, filter: "blur(4px)" },
};

const STROKE = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const formatElapsed = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;

export default function AiStatus({
  state = "thinking",
  label,
  detail,
  elapsed,
  className,
}: {
  state?: AiStatusState;
  label?: string;
  detail?: string;
  // Seconds, when the caller knows them (a finished reply). Otherwise an
  // active status counts on its own from when it started.
  elapsed?: number;
  className?: string;
}) {
  const reduced = !!useReducedMotion();
  const active = ACTIVE[state];
  const [counted, setCounted] = useState(0);

  useEffect(() => {
    if (!active || elapsed !== undefined) return;
    const start = Date.now();
    const id = window.setInterval(() => setCounted(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [active, elapsed]);

  const seconds = elapsed ?? counted;
  const time = formatElapsed(Math.max(0, Math.floor(seconds)));
  const text =
    label ??
    (state === "done" ? `Worked for ${time}` : state === "error" ? `Failed after ${time}` : state[0].toUpperCase() + state.slice(1));

  // The row springs between widths, so a new label glides instead of jumping.
  const measure = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const el = measure.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const swap = reduced ? INSTANT : SWAP;

  return (
    <div role="status" data-state={state} className={cn("flex h-8 w-fit items-center gap-2 text-sm", className)}>
      <span className="relative flex size-5 shrink-0 items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          <m.span
            key={state}
            aria-hidden
            variants={iconVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={reduced ? INSTANT : ICON}
            className="flex items-center justify-center"
          >
            <StatusIcon state={state} reduced={reduced} />
          </m.span>
        </AnimatePresence>
      </span>

      <m.div className="relative overflow-x-clip" initial={false} animate={{ width }} transition={swap}>
        <div ref={measure} className="flex w-max items-center gap-1.5 whitespace-nowrap">
          <span className="relative grid">
            <AnimatePresence initial={false} mode="popLayout">
              <m.span
                key={text}
                variants={swapVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={swap}
                className={cn("font-semibold", !active && (state === "error" ? "text-danger-600" : "text-ink-500"))}
              >
                {active ? <Shimmer reduced={reduced}>{text}</Shimmer> : text}
              </m.span>
            </AnimatePresence>
          </span>
          <AnimatePresence initial={false} mode="popLayout">
            {detail && (
              <m.span
                key={detail}
                variants={swapVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={swap}
                className="max-w-64 truncate text-ink-400"
              >
                {detail}
              </m.span>
            )}
          </AnimatePresence>
          {active && (
            <span aria-hidden className="tabular-nums text-ink-400">
              {time}
            </span>
          )}
        </div>
      </m.div>
    </div>
  );
}

function StatusIcon({ state, reduced }: { state: AiStatusState; reduced: boolean }) {
  const loop = (t: Transition) => (reduced ? INSTANT : t);
  switch (state) {
    case "thinking":
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} className="text-violet-500">
          <m.path
            d={SPARKLE_PATH}
            fill="currentColor"
            animate={reduced ? undefined : { rotate: [0, 90], scale: [1, 0.8, 1] }}
            transition={loop({ duration: 2.4, ...LOOP })}
          />
          <m.path
            d={TWINKLE_PATH}
            fill="currentColor"
            animate={reduced ? undefined : { scale: [0.4, 1, 0.4], opacity: [0.3, 1, 0.3] }}
            transition={loop({ duration: 1.2, ...LOOP })}
          />
        </svg>
      );
    case "researching":
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} className="text-violet-500">
          <m.g
            animate={reduced ? undefined : { x: [0, 2, 0, -2, 0], y: [-2, 0, 2, 0, -2] }}
            transition={loop({ duration: 2, repeat: Infinity, ease: "linear" })}
          >
            <circle {...STROKE} cx={10.5} cy={10.5} r={5.5} strokeWidth={2.25} />
            <path {...STROKE} d="M14.75 14.75L19 19" strokeWidth={2.5} />
          </m.g>
        </svg>
      );
    case "analyzing":
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} className="text-violet-500">
          {[6, 12, 18].map((x, i) => (
            <m.line
              key={x}
              {...STROKE}
              x1={x}
              x2={x}
              y1={10}
              y2={19}
              strokeWidth={3}
              animate={reduced ? undefined : { y1: [15, 5, 15] }}
              transition={loop({ duration: 0.9, delay: i * 0.15, ...LOOP })}
            />
          ))}
        </svg>
      );
    case "writing":
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} className="text-violet-500">
          <m.g
            animate={reduced ? undefined : { x: [0, 3, 0], y: [0, -1, 0], rotate: [0, -6, 0] }}
            transition={loop({ duration: 1.1, ...LOOP })}
          >
            <path d={PEN_PATH} fill="currentColor" transform="scale(0.8) translate(3 3)" />
          </m.g>
        </svg>
      );
    case "done":
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} className="text-brand-600">
          <m.path
            {...STROKE}
            d="M5 12.5L10 17.5L19 7"
            strokeWidth={2.5}
            initial={{ pathLength: reduced ? 1 : 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? INSTANT : { type: "spring", duration: 0.6, bounce: 0, delay: 0.1 }}
          />
        </svg>
      );
    case "error":
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} className="text-danger-600">
          <m.path
            {...STROKE}
            d="M7 7L17 17M17 7L7 17"
            strokeWidth={2.5}
            animate={reduced ? undefined : { x: [0, -3, 3, -2, 2, 0] }}
            transition={{ duration: 0.45, delay: 0.1 }}
          />
        </svg>
      );
  }
}

// The highlight sits mid-gradient and the size leaves room either side, so
// each sweep starts off the text.
function Shimmer({ reduced, children }: { reduced: boolean; children: React.ReactNode }) {
  if (reduced) return <span className="text-ink-500">{children}</span>;
  return (
    <m.span
      className="bg-clip-text text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--color-ink-400) 40%, var(--color-ink-900) 50%, var(--color-ink-400) 60%)",
        backgroundSize: "250% 100%",
      }}
      initial={{ backgroundPosition: "100% 0" }}
      animate={{ backgroundPosition: "0% 0" }}
      transition={{ duration: 1.6, ease: "linear", repeat: Infinity }}
    >
      {children}
    </m.span>
  );
}
