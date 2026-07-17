// src/components/Dropdown.tsx
// A small, consistent custom dropdown to replace native <select> where a styled,
// non-native control is wanted (e.g. in tables). Button trigger + popover menu,
// click-outside to close, keyboard-dismissable with Escape.
"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export type Option = { value: string; label: string };

export default function Dropdown({
  value,
  options,
  onChange,
  triggerClassName = "",
  align = "left",
  ariaLabel,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  triggerClassName?: string;
  align?: "left" | "right";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1 focus:outline-none ${triggerClassName}`}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute z-50 mt-1 min-w-[11rem] max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1 ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  selected ? "bg-emerald-50 text-emerald-700 font-semibold" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Check className={`w-3.5 h-3.5 shrink-0 ${selected ? "opacity-100 text-emerald-600" : "opacity-0"}`} />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
