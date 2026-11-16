// src/components/ai/StreamingResponse.tsx
// An assistant reply that develops into focus word by word: small uneven
// bursts, a pause at commas and full stops, each burst sharpening out of a
// soft blur behind a small dot that glides along the line. Bold, code, lists
// and links are formatted the moment they appear, never shown as raw symbols.
//
// The diagnosis service answers in one piece, not token by token, so this
// reveals a reply that has already arrived. A reply that was already there
// (history, a resumed session) shows at once.
//
// Adapted from Rare UI's Streaming Response (https://rareui.com/components/streamingresponse),
// Copyright (c) 2026 Swami Malode, MIT + Commons Clause + Attribution. Ported
// to this app's tokens; the rating buttons are left out because nothing
// would record the rating.
"use client";

import { Check, Copy } from "lucide-react";
import { AnimatePresence, m, useReducedMotion, type Transition } from "motion/react";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SPEED = 14;
const MAX_CHUNK = 3;
const CATCH_UP = 16;
const SENTENCE_PAUSE_MS = 200;
const CLAUSE_PAUSE_MS = 80;
const SHARPEN_MS = 260;
const DEVELOP_MS = 520;
const GLIDE_MS = 180;
const STAGGER_MS = 16;
const MAX_STAGGER_MS = 60;
const COPIED_MS = 1600;
const SWAP: Transition = { type: "spring", duration: 0.35, bounce: 0.2 };
const INSTANT: Transition = { duration: 0 };

type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href?: string; children: Inline[] };

type Block =
  | { type: "p"; text: string }
  | { type: "h"; level: number; text: string }
  | { type: "ul"; start: number; items: string[] }
  | { type: "ol"; start: number; items: string[] };

const HEADING = /^(#{1,3})\s+(.*)$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
const ORDERED = /^\s*(\d+)[.)]\s+(.*)$/;
const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;
const startsBlock = (line: string) => HEADING.test(line) || BULLET.test(line) || ORDERED.test(line);

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: "h", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }
    const list = BULLET.test(line) ? BULLET : ORDERED.test(line) ? ORDERED : null;
    if (list) {
      const items: string[] = [];
      const start = Number.parseInt(line.match(ORDERED)?.[1] ?? "1", 10);
      while (i < lines.length && list.test(lines[i])) {
        const m = lines[i].match(list)!;
        items.push(m[m.length - 1]);
        i += 1;
      }
      blocks.push({ type: list === BULLET ? "ul" : "ol", start, items });
      continue;
    }
    const body = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i])) {
      body.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", text: body.join("\n") });
  }
  return blocks;
}

// While revealing, an unclosed marker counts as closed, so text never flashes
// raw asterisks and then reflows.
function parseInline(src: string, final: boolean): Inline[] {
  const out: Inline[] = [];
  let text = "";
  let i = 0;
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };
  const close = (marker: string, from: number) => {
    const end = src.indexOf(marker, from);
    return end < 0 && final ? -2 : end;
  };
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1] ?? "";
    if (c === "`") {
      const end = close("`", i + 1);
      if (end !== -2) {
        flush();
        out.push({ type: "code", text: src.slice(i + 1, end < 0 ? undefined : end) });
        i = end < 0 ? src.length : end + 1;
        continue;
      }
    } else if (c === "*" && next === "*" && src[i + 2] && !/\s/.test(src[i + 2])) {
      const end = close("**", i + 2);
      if (end !== -2) {
        flush();
        out.push({ type: "strong", children: parseInline(src.slice(i + 2, end < 0 ? undefined : end), final) });
        i = end < 0 ? src.length : end + 2;
        continue;
      }
    } else if ((c === "*" || (c === "_" && !/\w/.test(src[i - 1] ?? ""))) && next && !/\s/.test(next)) {
      const end = close(c, i + 1);
      if (end !== -2) {
        flush();
        out.push({ type: "em", children: parseInline(src.slice(i + 1, end < 0 ? undefined : end), final) });
        i = end < 0 ? src.length : end + 1;
        continue;
      }
    } else if (c === "[") {
      const bracket = src.indexOf("]", i + 1);
      const after = src[bracket + 1];
      if (bracket > 0 && after === "(") {
        const paren = src.indexOf(")", bracket + 2);
        if (paren > 0) {
          const href = src.slice(bracket + 2, paren);
          flush();
          out.push({
            type: "link",
            href: SAFE_HREF.test(href) ? href : undefined,
            children: parseInline(src.slice(i + 1, bracket), final),
          });
          i = paren + 1;
          continue;
        }
      }
    }
    text += c;
    i += 1;
  }
  flush();
  return out;
}

function wordEnds(text: string) {
  return Array.from(text.matchAll(/\S+/g), (m) => (m.index ?? 0) + m[0].length);
}

const fresh = { at: 0, n: 0 };

function Word({ animate, children }: { animate: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !animate) return;
    // Words that mount in the same frame stagger in reading order.
    const now = performance.now();
    if (now - fresh.at > 8) {
      fresh.at = now;
      fresh.n = 0;
    }
    const delay = Math.min(fresh.n * STAGGER_MS, MAX_STAGGER_MS);
    fresh.n += 1;
    el.animate([{ filter: "blur(5px)" }, { filter: "blur(0px)" }], {
      duration: SHARPEN_MS,
      delay,
      easing: "cubic-bezier(0.2, 0.7, 0.3, 1)",
      fill: "backwards",
    });
    el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DEVELOP_MS,
      delay,
      easing: "cubic-bezier(0.25, 0.6, 0.35, 1)",
      fill: "backwards",
    });
  }, [animate]);
  return <span ref={ref}>{children}</span>;
}

type Ctx = { i: number; from: number; caret: React.ReactNode };

function renderInline(nodes: Inline[], ctx: Ctx): React.ReactNode[] {
  return nodes.flatMap((node): React.ReactNode[] => {
    const key = ctx.i;
    if (node.type === "text") {
      return node.text.split(/(\s+)/).map((token, t) => {
        if (!token) return null;
        if (/^\s+$/.test(token)) return token.includes("\n") ? <br key={`b${key}-${t}`} /> : token;
        ctx.i += 1;
        return (
          <Word key={`w${ctx.i}`} animate={ctx.i > ctx.from}>
            {token}
          </Word>
        );
      });
    }
    if (node.type === "code") {
      ctx.i += 1;
      return [
        <Word key={`w${ctx.i}`} animate={ctx.i > ctx.from}>
          <code className="rounded bg-ink-100 px-1.5 py-0.5 text-[0.9em] text-ink-900">{node.text}</code>
        </Word>,
      ];
    }
    const children = renderInline(node.children, ctx);
    if (node.type === "strong")
      return [
        <strong key={`s${key}`} className="font-semibold text-ink-900">
          {children}
        </strong>,
      ];
    if (node.type === "em") return [<em key={`e${key}`}>{children}</em>];
    return [
      node.href ? (
        <a
          key={`a${key}`}
          href={node.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-700 underline decoration-brand-300 underline-offset-4"
        >
          {children}
        </a>
      ) : (
        <span key={`a${key}`} className="underline underline-offset-4">
          {children}
        </span>
      ),
    ];
  });
}

type CaretTrack = { x: number; y: number; glide?: Animation } | null;

function Caret({ reduced, trackRef }: { reduced: boolean; trackRef: React.RefObject<CaretTrack> }) {
  const ref = useRef<HTMLSpanElement>(null);
  // The dot slides to each new word, from wherever it visibly is, so a slide
  // cut short never snaps back.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const last = trackRef.current;
    const offset =
      (last?.glide?.effect as KeyframeEffect | null | undefined)?.target === el
        ? Number.parseFloat(getComputedStyle(el).translate) || 0
        : 0;
    const rect = el.getBoundingClientRect();
    const x = rect.left - offset;
    if (last && last.x === x && last.y === rect.top) return;
    last?.glide?.cancel();
    const from = last ? last.x + offset - x : 0;
    const sameLine = last && Math.abs(last.y - rect.top) <= 2;
    trackRef.current = {
      x,
      y: rect.top,
      glide:
        sameLine && from < 0 && !reduced
          ? el.animate([{ translate: `${from}px 0` }, { translate: "0 0" }], {
              duration: GLIDE_MS,
              easing: "cubic-bezier(0.25, 0.8, 0.3, 1)",
            })
          : undefined,
    };
  });
  return (
    <span
      ref={ref}
      aria-hidden
      className="ml-1.5 inline-block size-[0.4em] rounded-full bg-violet-500 align-[0.05em] motion-safe:animate-pulse"
    />
  );
}

function renderBlock(block: Block, ctx: Ctx, caret: boolean, final: boolean): React.ReactNode {
  const inline = (src: string, withCaret: boolean) => {
    const nodes = renderInline(parseInline(src, final), ctx);
    return withCaret ? [...nodes, ctx.caret] : nodes;
  };
  if (block.type === "h") {
    return <p className="font-semibold text-ink-900">{inline(block.text, caret)}</p>;
  }
  if (block.type === "ul" || block.type === "ol") {
    const List = block.type;
    return (
      <List
        start={block.type === "ol" && block.start !== 1 ? block.start : undefined}
        className={cn(
          "flex flex-col gap-1 pl-5 marker:text-ink-400",
          block.type === "ul" ? "list-disc" : "list-decimal marker:tabular-nums",
        )}
      >
        {block.items.map((item, n) => (
          <li key={n} className="pl-1">
            {inline(item, caret && n === block.items.length - 1)}
          </li>
        ))}
      </List>
    );
  }
  return <p>{inline(block.text, caret)}</p>;
}

export default function StreamingResponse({
  text,
  animate = false,
  speed = SPEED,
  copyable = true,
  onSettled,
  className,
}: {
  text: string;
  // Reveal the text word by word. Off for text that was already there.
  animate?: boolean;
  speed?: number;
  copyable?: boolean;
  // Fires once the last word is on screen (at once when not animating).
  onSettled?: () => void;
  className?: string;
}) {
  const reduced = !!useReducedMotion();
  const ends = wordEnds(text);
  const [count, setCount] = useState(() => (animate && !reduced ? 0 : ends.length));
  const counted = useRef(count);
  const wait = useRef(0);
  const settledOnce = useRef(false);

  useEffect(() => {
    if (counted.current >= ends.length) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      wait.current -= Math.min(now - last, 100);
      last = now;
      // Words land in uneven chunks after uneven gaps, like tokens off a model.
      while (wait.current <= 0 && counted.current < ends.length) {
        const backlog = ends.length - counted.current;
        const chunk = 1 + Math.floor(Math.random() * MAX_CHUNK);
        counted.current = Math.min(ends.length, counted.current + chunk);
        const tail = text[ends[counted.current - 1] - 1];
        const pause = /[.!?]/.test(tail) ? SENTENCE_PAUSE_MS : /[,;:]/.test(tail) ? CLAUSE_PAUSE_MS : 0;
        const gap = ((chunk * 1000) / Math.max(speed, 1)) * (0.5 + Math.random());
        wait.current += (gap + pause) / (1 + backlog / (CATCH_UP * 4));
      }
      setCount(counted.current);
      if (counted.current < ends.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, speed]);

  const settled = count >= ends.length;
  useEffect(() => {
    if (settled && !settledOnce.current) {
      settledOnce.current = true;
      onSettled?.();
    }
  }, [settled, onSettled]);

  const shown = settled ? text.length : (ends[count - 1] ?? 0);
  const visible = text.slice(0, shown);
  const caretTrack = useRef<CaretTrack>(null);
  const caret = !settled ? <Caret key="caret" reduced={reduced} trackRef={caretTrack} /> : null;
  const [initialWords] = useState(() => (animate && !reduced ? 0 : Infinity));
  const ctx: Ctx = { i: 0, from: initialWords, caret };
  const blocks = parseBlocks(visible);
  const content = blocks.map((block, n) => (
    <React.Fragment key={`b${n}`}>{renderBlock(block, ctx, n === blocks.length - 1 && !!caret, settled)}</React.Fragment>
  ));

  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div aria-busy={!settled} className={cn("flex flex-col text-sm leading-relaxed text-ink-800", className)}>
      <div className="flex flex-col gap-3 break-words">{content.length ? content : caret && <p>{caret}</p>}</div>
      <AnimatePresence>
        {copyable && settled && (
          <m.div
            key="actions"
            initial={reduced ? false : { opacity: 0, y: 4, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={reduced ? INSTANT : SWAP}
            className="-ml-2 mt-1 flex items-center text-ink-400"
          >
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? "Copied" : "Copy the reply"}
              title={copied ? "Copied" : "Copy the reply"}
              className="flex size-8 items-center justify-center rounded-full transition-colors hover:bg-ink-100 hover:text-ink-900 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className="grid">
                <AnimatePresence initial={false}>
                  <m.span
                    key={copied ? "on" : "off"}
                    className="col-start-1 row-start-1 grid place-items-center"
                    initial={{ scale: 0.5, opacity: 0, filter: "blur(3px)" }}
                    animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                    exit={{ scale: 0.5, opacity: 0, filter: "blur(3px)" }}
                    transition={reduced ? INSTANT : SWAP}
                  >
                    {copied ? <Check className="size-4 text-brand-600" /> : <Copy className="size-4" />}
                  </m.span>
                </AnimatePresence>
              </span>
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
