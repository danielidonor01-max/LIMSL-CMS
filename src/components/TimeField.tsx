// src/components/TimeField.tsx
// The branded replacement for <input type="time">.
//
// Same principle as DateField: typing is the primary path. A technician
// recording that work started at half seven types 730, or 7:30, or 7.30am, and
// all of them resolve. The quick list is for pointing, not for entering, which
// is why it holds working-day hours rather than every slot in a day.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { isTime, parseTimeInput } from "@/lib/date-field";

// Half-hours across a workshop day. A full 48-slot list is a scroll, and
// anything unusual is quicker to type than to hunt for.
const QUICK = Array.from({ length: 27 }, (_, i) => {
  const mins = 6 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
});

export default function TimeField({
  value,
  onChange,
  name,
  defaultValue,
  id,
  required,
  disabled,
  className = "",
  ariaLabel,
}: {
  // Some forms are uncontrolled and read on submit through FormData. Rather
  // than rewrite those forms into controlled ones, the field can carry a name
  // and hold its own value, and a hidden input keeps the submit contract
  // exactly as it was.
  value?: string;
  onChange?: (time: string) => void;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  name?: string;
  defaultValue?: string;
}) {
  const [own, setOwn] = useState(defaultValue ?? "");
  const uncontrolled = value === undefined;
  const current = uncontrolled ? own : value;
  const emit = (next: string) => {
    if (uncontrolled) setOwn(next);
    onChange?.(next);
  };
  const autoId = useId();
  const fieldId = id ?? autoId;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current ?? "");
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setText(current ?? "");
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = () => {
    const parsed = parseTimeInput(text);
    if (parsed) {
      emit(parsed);
      setText(parsed);
    } else if (!text.trim()) {
      emit("");
    } else {
      setText(isTime(current) ? current : "");
    }
  };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      {/* Keeps the FormData contract for forms that read fields by name. */}
      {name && <input type="hidden" name={name} value={current ?? ""} />}
      <div className="flex items-stretch">
        <input
          ref={inputRef}
          id={fieldId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          disabled={disabled}
          required={required}
          aria-label={ariaLabel}
          placeholder="HH:MM"
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          className="w-full bg-ink-50 border border-line rounded-l-lg px-3 py-2 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:opacity-60"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Close the time list" : "Open the time list"}
          aria-expanded={open}
          className="shrink-0 min-w-11 px-3 border border-l-0 border-line rounded-r-lg bg-surface text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors disabled:opacity-60"
        >
          <Clock className="w-4 h-4 mx-auto" />
        </button>
      </div>

      {open && (
        <div
          role="listbox"
          aria-label="Choose a time"
          className="absolute z-50 mt-2 py-1 bg-surface border border-line rounded-xl shadow-raised max-h-64 overflow-y-auto w-40"
        >
          {QUICK.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={t === current}
              onClick={() => {
                emit(t);
                setText(t);
                setOpen(false);
                inputRef.current?.focus();
              }}
              className={`w-full text-left px-3 min-h-11 text-sm transition-colors ${
 t === current ? "bg-brand-600 text-white font-semibold" : "text-ink-700 hover:bg-ink-100"
 }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
