// src/components/Select.tsx
// The app-wide replacement for native <select>. Renders a styled field trigger
// + popover option list (like Dropdown, but form-field shaped), so no browser-
// drawn menu ever appears. Near-drop-in: it accepts the same <option> children a
// native select takes (or an `options` prop), only the onChange signature
// differs (plain value, not an event). Keyboard: Enter/Space/ArrowDown open,
// arrows move, Enter selects, Esc closes.
//
// Type to find (LIMSL, 17 Nov 2026): a long list (more than 8 options, or
// `searchable`) turns its field into a text box while it is open, the way a
// country field does. Type and the list narrows as you go; there is no second
// search bar above the field. Typing on the closed field opens it with that
// letter already in. An option may carry hidden `keywords` (an <option>'s
// `data-keywords`), so a machine is still found by its tag number without the
// tag being printed beside its name.
"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";

export type SelectOption = { value: string; label: string; keywords?: string };

/** More options than this and the field becomes type-to-find by default. */
export const SEARCHABLE_FROM = 9;

function optionsFromChildren(children: React.ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const el = child as React.ReactElement<{
      value?: unknown;
      children?: React.ReactNode;
      "data-keywords"?: string;
    }>;
    if (el.type === "option") {
      const value = String(el.props.value ?? "");
      const label =
        typeof el.props.children === "string" || typeof el.props.children === "number"
          ? String(el.props.children)
          : React.Children.toArray(el.props.children).join("");
      out.push({ value, label, keywords: el.props["data-keywords"] });
    } else if (el.type === "optgroup" || el.type === React.Fragment) {
      out.push(...optionsFromChildren(el.props.children));
    }
  });
  return out;
}

/** Every word typed must appear in the option's label or keywords. */
export function matchesQuery(o: SelectOption, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const hay = `${o.label} ${o.keywords ?? ""}`.toLowerCase();
  return words.every((w) => hay.includes(w));
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
  searchable,
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
  /** Type to find. Defaults to on for lists longer than eight. */
  searchable?: boolean;
}) {
  const opts = useMemo(() => options ?? optionsFromChildren(children), [options, children]);
  const canSearch = searchable ?? opts.length >= SEARCHABLE_FROM;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(-1); // highlighted index while navigating
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const current = opts.find((o) => o.value === value);

  const shown = useMemo(
    () => (canSearch && query.trim() ? opts.filter((o) => matchesQuery(o, query)) : opts),
    [opts, canSearch, query],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // The text box takes the focus as soon as a searchable list opens.
  useEffect(() => {
    if (open && canSearch) inputRef.current?.focus();
  }, [open, canSearch]);

  // Keep the highlighted option scrolled into view while navigating.
  useEffect(() => {
    if (!open || hi < 0) return;
    listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" });
  }, [open, hi]);

  function close(refocus = false) {
    setOpen(false);
    setQuery("");
    if (refocus) triggerRef.current?.focus();
  }

  const openList = (initial = "") => {
    if (disabled) return;
    setQuery(initial);
    setHi(initial ? 0 : Math.max(0, opts.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const pick = (v: string) => {
    onChange(v);
    close(true);
  };

  const navigate = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hi >= 0 && shown[hi]) pick(shown[hi].value);
    } else if (e.key === "Tab") close();
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      } else if (canSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Start typing on the closed field: open it with that letter in.
        e.preventDefault();
        openList(e.key);
      }
      return;
    }
    navigate(e);
  };

  const fieldClass = `w-full flex items-center justify-between gap-2 bg-ink-50 border border-ink-200 rounded-lg px-3 py-2 text-sm text-left transition-colors focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:opacity-50 disabled:cursor-not-allowed`;

  return (
    <div className={`relative ${className}`} ref={ref}>
      {open && canSearch ? (
        <div className={`${fieldClass} border-brand-500 ring-2 ring-brand-500/15`}>
          <Search className="w-4 h-4 shrink-0 text-ink-400" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-label={ariaLabel ?? placeholder}
            aria-expanded={true}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHi(0);
            }}
            onKeyDown={navigate}
            placeholder={current?.label ?? "Type to search…"}
            className="flex-1 min-w-0 bg-transparent text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
          <button
            type="button"
            aria-label="Close the list"
            onClick={() => close(true)}
            className="shrink-0 text-ink-400 hover:text-ink-700"
          >
            <ChevronDown className="w-4 h-4 rotate-180 transition-transform" />
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-required={required || undefined}
          disabled={disabled}
          onClick={() => (open ? close() : openList())}
          onKeyDown={onTriggerKey}
          className={`${fieldClass} ${current ? "text-ink-900" : "text-ink-400"}`}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronDown className={`w-4 h-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 left-0 right-0 min-w-[10rem] max-h-64 overflow-y-auto bg-white border border-ink-200 rounded-lg shadow-raised py-1"
        >
          {shown.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink-500">Nothing matches “{query.trim()}”.</p>
          ) : (
            shown.map((o, i) => {
              const selected = o.value === value;
              return (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(o.value)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    selected
                      ? "bg-brand-50 text-brand-700 font-semibold"
                      : i === hi
                        ? "bg-ink-100 text-ink-900"
                        : "text-ink-700"
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 shrink-0 ${selected ? "opacity-100 text-brand-600" : "opacity-0"}`} />
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
