// src/components/DateField.tsx
// The branded replacement for <input type="date">.
//
// Custom date pickers usually make things worse: they take away typing, they
// take away the keyboard, and they turn into something unusable on a phone. So
// the calendar here is an affordance and never the only way in.
//
//  • The field is a real text input. Type 15/09/2026, 2026-09-15, 15.9.26 or
//    5/9/26 and it resolves on blur. Nobody has to open the calendar.
//  • 16px on touch, or iOS zooms the page in and never zooms back.
//  • Day cells are 40px and the grid is six rows always, so the footer under it
//    does not move as you page through months.
//  • Arrows move a day, PageUp/PageDown a month, Home/End the week, Enter picks,
//    Escape closes and returns focus to the field.
"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  addMonths,
  isIsoDate,
  isWithinRange,
  monthGrid,
  monthLabel,
  parseDateInput,
  todayIso,
} from "@/lib/date-field";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

export default function DateField({
  value,
  onChange,
  name,
  defaultValue,
  min,
  max,
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
  onChange?: (iso: string) => void;
  min?: string | null;
  max?: string | null;
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
  const [cursor, setCursor] = useState(() => (isIsoDate(current) ? current : todayIso()));
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // A change from the parent (a form reset, a prefill) must reach the field.
  const [seen, setSeen] = useState(current);
  if (seen !== current) {
    setSeen(current);
    setText(current ?? "");
    if (isIsoDate(current)) setCursor(current);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Typing is resolved when the field is left, not on every keystroke, so a
  // half-typed date is never thrown away mid-entry.
  const commit = () => {
    const parsed = parseDateInput(text);
    if (parsed && isWithinRange(parsed, min, max)) {
      emit(parsed);
      setText(parsed);
      setCursor(parsed);
    } else if (!text.trim()) {
      emit("");
    } else {
      // Unparseable, so put back what was actually stored rather than leaving
      // the person looking at text the record does not hold.
      setText(current ?? "");
    }
  };

  const pick = (iso: string) => {
    if (!isWithinRange(iso, min, max)) return;
    emit(iso);
    setText(iso);
    setCursor(iso);
    setOpen(false);
    inputRef.current?.focus();
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (moves[e.key] !== undefined) {
      e.preventDefault();
      setCursor((c) => addDays(c, moves[e.key]));
      return;
    }
    if (e.key === "PageUp" || e.key === "PageDown") {
      e.preventDefault();
      setCursor((c) => addMonths(c, e.key === "PageUp" ? -1 : 1));
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const day = (new Date(`${cursor}T00:00:00Z`).getUTCDay() + 6) % 7;
      setCursor((c) => addDays(c, e.key === "Home" ? -day : 6 - day));
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(cursor);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      inputRef.current?.focus();
    }
  };

  const [cy, cm] = cursor.split("-").map(Number);
  const grid = monthGrid(cy, cm);
  const today = todayIso();

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
          placeholder="YYYY-MM-DD"
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
          aria-label={open ? "Close the calendar" : "Open the calendar"}
          aria-expanded={open}
          aria-controls={`${fieldId}-cal`}
          className="shrink-0 min-w-11 px-3 border border-l-0 border-line rounded-r-lg bg-surface text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors disabled:opacity-60"
        >
          <Calendar className="w-4 h-4 mx-auto" />
        </button>
      </div>

      {open && (
        <div
          id={`${fieldId}-cal`}
          role="dialog"
          aria-label="Choose a date"
          className="absolute z-50 mt-2 p-3 bg-surface border border-line rounded-xl shadow-raised w-[19rem]"
          onKeyDown={onGridKey}
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setCursor((c) => addMonths(c, -1))}
              aria-label="Previous month"
              className="min-w-11 min-h-11 grid place-items-center rounded-lg text-ink-500 hover:text-ink-900 hover:bg-ink-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p aria-live="polite" className="text-sm font-semibold text-ink-900">
              {monthLabel(cursor)}
            </p>
            <button
              type="button"
              onClick={() => setCursor((c) => addMonths(c, 1))}
              aria-label="Next month"
              className="min-w-11 min-h-11 grid place-items-center rounded-lg text-ink-500 hover:text-ink-900 hover:bg-ink-100"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5" role="grid">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-[11px] font-semibold text-ink-400 text-center py-1">
                {d}
              </div>
            ))}
            {grid.map((day) => {
              const selected = day.iso === current;
              const focused = day.iso === cursor;
              const allowed = isWithinRange(day.iso, min, max);
              return (
                <button
                  key={day.iso}
                  type="button"
                  role="gridcell"
                  tabIndex={focused ? 0 : -1}
                  aria-selected={selected}
                  aria-current={day.iso === today ? "date" : undefined}
                  disabled={!allowed}
                  onClick={() => pick(day.iso)}
                  ref={(el) => {
                    if (focused && open) el?.focus();
                  }}
                  className={`h-10 rounded-lg text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    selected
                      ? "bg-brand-600 text-white font-semibold"
                      : day.iso === today
                        ? "text-brand-700 font-semibold hover:bg-ink-100"
                        : day.inMonth
                          ? "text-ink-800 hover:bg-ink-100"
                          : "text-ink-300 hover:bg-ink-100"
                  }`}
                >
                  {Number(day.iso.slice(8))}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mt-2 pt-2 border-t border-line">
            <button
              type="button"
              onClick={() => pick(today)}
              disabled={!isWithinRange(today, min, max)}
              className="text-xs font-semibold text-brand-700 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                emit("");
                setText("");
                setOpen(false);
              }}
              className="text-xs font-semibold text-ink-500 hover:text-ink-900"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
