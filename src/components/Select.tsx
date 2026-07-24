// src/components/Select.tsx
// The app-wide replacement for native <select>. Renders a styled field trigger
// + popover option list (like Dropdown, but form-field shaped), so no browser-
// drawn menu ever appears. Near-drop-in: it accepts the same <option> children a
// native select takes (or an `options` prop) — only the onChange signature
// differs (plain value, not an event). Keyboard: Enter/Space/ArrowDown open,
// arrows move, Enter selects, Esc closes.
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export type SelectOption = { value: string; label: string };

function optionsFromChildren(children: React.ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const el = child as React.ReactElement<{ value?: unknown; children?: React.ReactNode }>;
    if (el.type === "option") {
      const value = String(el.props.value ?? "");
      const label =
        typeof el.props.children === "string" || typeof el.props.children === "number"
          ? String(el.props.children)
          : React.Children.toArray(el.props.children).join("");
      out.push({ value, label });
    } else if (el.type === "optgroup" || el.type === React.Fragment) {
      out.push(...optionsFromChildren(el.props.children));
    }
  });
  return out;
}

export default function Select({
  value,
  onChange,
  options,
  children,
  placeholder = "Select…",
  disabled = false,
  required = false,
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options?: SelectOption[];
  children?: React.ReactNode;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const opts = useMemo(() => options ?? optionsFromChildren(children), [options, children]);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1); // highlighted index while navigating
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const current = opts.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keep the highlighted option scrolled into view while navigating.
  useEffect(() => {
    if (!open || hi < 0) return;
    listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" });
  }, [open, hi]);

  const openList = () => {
    if (disabled) return;
    setHi(Math.max(0, opts.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((i) => Math.min(opts.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hi >= 0 && opts[hi]) pick(opts[hi].value);
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        className={`w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-left transition-colors focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-50 disabled:cursor-not-allowed ${
          current ? "text-slate-900" : "text-slate-400"
        }`}
      >
        <span className="truncate">{current?.label ?? placeholder}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 left-0 right-0 min-w-[10rem] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1"
        >
          {opts.map((o, i) => {
            const selected = o.value === value;
            return (
              <button
                key={`${o.value}-${i}`}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  selected
                    ? "bg-emerald-50 text-emerald-700 font-semibold"
                    : i === hi
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-700"
                }`}
              >
                <Check className={`w-3.5 h-3.5 shrink-0 ${selected ? "opacity-100 text-emerald-600" : "opacity-0"}`} />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
