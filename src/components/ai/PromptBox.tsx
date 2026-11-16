// src/components/ai/PromptBox.tsx
// The composer for the AI assistant. The field grows with what you type, the
// placeholder rotates through things worth saying, and on send the words rise
// out of the box toward the thread they are joining. While the assistant works
// the send button carries a turning ring, so "it is working" lives where you
// pressed.
//
// Adapted from Rare UI's AI Prompt Box (https://rareui.com/components/promptbox),
// Copyright (c) 2026 Swami Malode, MIT + Commons Clause + Attribution. Ported
// to this app's tokens and trimmed: no hold-to-think-harder effort levels (the
// diagnosis service has one depth), and the send shortcut follows the user's
// own preference rather than always Enter.
"use client";

import { AnimatePresence, animate, m, useReducedMotion, type Transition, type Variants } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const LINE = 24;
const MAX_HEIGHT = 192;
const PLACEHOLDER_MS = 3200;
const MAX_WORDS = 80;
const RISE = 32;
const LIFT = [0.32, 0.72, 0, 1] as const;

const SWAP: Transition = { type: "spring", duration: 0.45, bounce: 0.15 };
const GROW: Transition = { type: "spring", duration: 0.4, bounce: 0.1 };
const INSTANT: Transition = { duration: 0 };

const swapVariants: Variants = {
  enter: { y: 6, opacity: 0, filter: "blur(4px)" },
  center: { y: 0, opacity: 1, filter: "blur(0px)" },
  exit: { y: -6, opacity: 0, filter: "blur(4px)" },
};

type Ghost = { id: number; text: string; scroll: number; width: number; height: number };

export default function PromptBox({
  value,
  onValueChange,
  onSubmit,
  busy = false,
  canSendEmpty = false,
  enterToSend = false,
  placeholder = "Ask anything",
  top,
  actions,
  hint,
  disabled = false,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  onSubmit: (text: string) => void;
  // The assistant is working on the last message.
  busy?: boolean;
  // A message can go with nothing typed (photos alone, say).
  canSendEmpty?: boolean;
  // Enter sends (Shift+Enter is a new line). Otherwise Ctrl/Cmd+Enter sends
  // and Enter is a plain new line, which is safer on a phone.
  enterToSend?: boolean;
  placeholder?: string | string[];
  // Above the field, inside the box: attachments.
  top?: React.ReactNode;
  // Left of the send button: attach and the like.
  actions?: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const reduced = !!useReducedMotion();
  const placeholders = Array.isArray(placeholder) ? placeholder : [placeholder];
  const canSend = !disabled && !busy && (value.trim().length > 0 || canSendEmpty);

  const fieldRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);
  const ghostCount = useRef(0);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [fieldWidth, setFieldWidth] = useState(0);

  // The height stays put while the words rise out, so the box does not shrink
  // under them.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    const field = fieldRef.current;
    if (!el || !field || ghost) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, LINE), MAX_HEIGHT);
    el.style.height = `${next}px`;
    animate(field, { height: next }, reduced ? INSTANT : GROW);
  }, [value, ghost, fieldWidth, reduced]);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    const ro = new ResizeObserver(() => setFieldWidth(field.offsetWidth));
    ro.observe(field);
    return () => ro.disconnect();
  }, []);

  const rotating = placeholders.length > 1 && !value;
  useEffect(() => {
    if (!rotating) return;
    const id = window.setInterval(() => setPlaceholderIndex((i) => i + 1), PLACEHOLDER_MS);
    return () => window.clearInterval(id);
  }, [rotating]);

  useLayoutEffect(() => {
    const layer = ghostRef.current;
    if (!ghost || !layer) return;
    let cancelled = false;
    const view = layer.getBoundingClientRect();
    const words = Array.from(layer.querySelectorAll<HTMLElement>("[data-word]")).filter((word) => {
      const box = word.getBoundingClientRect();
      const seen = box.bottom > view.top + RISE && box.top < view.bottom;
      if (!seen) word.style.visibility = "hidden";
      return seen;
    });
    // The whole flight stays under half a second however long the message is.
    const step = Math.min(0.03, 0.3 / Math.max(words.length, 1));
    const flights = words.length
      ? words.map((word, i) =>
          animate(word, { y: -RISE, opacity: 0, filter: "blur(4px)" }, { duration: 0.4, delay: i * step, ease: LIFT }),
        )
      : [animate(layer.firstElementChild ?? layer, { y: -8, opacity: 0, filter: "blur(4px)" }, { duration: 0.35, ease: LIFT })];
    Promise.all(flights).then(() => {
      if (cancelled) return;
      setGhost(null);
      if (iconRef.current) animate(iconRef.current, { scale: [1, 1.25, 1] }, { duration: 0.35, ease: "easeOut" });
    });
    return () => {
      cancelled = true;
      flights.forEach((f) => f.stop());
    };
  }, [ghost]);

  const submit = () => {
    if (!canSend) return;
    if (!reduced && value.trim()) {
      ghostCount.current += 1;
      const el = textareaRef.current;
      setGhost({
        id: ghostCount.current,
        text: value,
        scroll: el?.scrollTop ?? 0,
        width: el?.clientWidth ?? 0,
        height: fieldRef.current?.offsetHeight ?? LINE,
      });
    }
    onSubmit(value);
  };

  const tokens = ghost?.text.split(/(\s+)/) ?? [];
  const flyWords = tokens.filter((t) => t.trim()).length <= MAX_WORDS;

  return (
    <div
      data-busy={busy || undefined}
      className={cn(
        "relative flex w-full flex-col rounded-xl border border-line bg-surface shadow-card transition-colors focus-within:border-ink-400",
        disabled && "opacity-60",
        className,
      )}
    >
      {top && <div className="px-4 pt-3">{top}</div>}

      <div className="relative px-4 pt-3.5">
        <m.div ref={fieldRef} className="relative overflow-hidden" style={{ height: LINE }}>
          <AnimatePresence initial={false}>
            {!value && (
              <m.span
                key="placeholder"
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: INSTANT }}
                transition={reduced ? INSTANT : { duration: 0.2, delay: ghost ? 0.25 : 0 }}
                className="pointer-events-none absolute inset-x-0 top-0 grid text-base leading-6 text-ink-400"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  <m.span
                    key={placeholderIndex % placeholders.length}
                    variants={swapVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={reduced ? INSTANT : SWAP}
                    className="truncate"
                  >
                    {placeholders[placeholderIndex % placeholders.length]}
                  </m.span>
                </AnimatePresence>
              </m.span>
            )}
          </AnimatePresence>
          <textarea
            ref={textareaRef}
            aria-label={placeholders[0]}
            rows={1}
            value={value}
            disabled={disabled}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              if (enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey) {
                e.preventDefault();
                if (!e.repeat) submit();
              }
            }}
            style={{ height: LINE }}
            className="relative block w-full resize-none break-words bg-transparent text-base leading-6 text-ink-900 outline-none [scrollbar-width:thin] disabled:cursor-not-allowed"
          />
        </m.div>

        {ghost && (
          // Clipped to what the field showed, plus headroom above for the rise.
          <div
            key={ghost.id}
            ref={ghostRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-4 z-10 overflow-hidden"
            style={{
              top: 14 - (flyWords ? RISE : 0),
              height: ghost.height + (flyWords ? RISE : 0),
              paddingTop: flyWords ? RISE : 0,
            }}
          >
            <div
              className="whitespace-pre-wrap break-words text-base leading-6 text-ink-900"
              style={{ marginTop: -ghost.scroll, width: ghost.width || undefined }}
            >
              {flyWords
                ? tokens.map((t, i) =>
                    t.trim() ? (
                      <span key={i} data-word className="inline-block">
                        {t}
                      </span>
                    ) : (
                      t
                    ),
                  )
                : ghost.text}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-2.5 pt-2.5 pb-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">{actions}</div>
        {hint && <span className="hidden sm:inline text-xs text-ink-400 whitespace-nowrap">{hint}</span>}

        <div className="relative flex size-10 shrink-0 items-center justify-center">
          <AnimatePresence>
            {busy && (
              <m.span
                key="ring"
                aria-hidden
                className="pointer-events-none absolute -inset-[3px] rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent 0%, transparent 35%, var(--color-violet-500) 100%)",
                  mask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))",
                  WebkitMask: "radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 1.5px))",
                }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={reduced ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, rotate: 360 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{
                  opacity: { duration: 0.3 },
                  scale: SWAP,
                  rotate: { duration: 1.1, ease: "linear", repeat: Infinity },
                }}
              />
            )}
          </AnimatePresence>
          <button
            type="button"
            disabled={!canSend}
            aria-label={busy ? "The assistant is working on your last message" : "Send"}
            title={busy ? "Working…" : "Send"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={submit}
            className={cn(
              "relative flex size-10 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
              canSend ? "cursor-pointer bg-brand-600 text-white hover:bg-brand-700" : "cursor-default bg-ink-100 text-ink-400",
            )}
          >
            <span ref={iconRef} className="grid size-[18px] place-items-center">
              <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
                <path
                  d="M12 19V5M5.5 11.5L12 5l6.5 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.25}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
