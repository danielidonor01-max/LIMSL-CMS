// src/components/Field.tsx
// One form-field surface for the whole app. Seventeen pages each declared their
// own `const field = "..."` and they had quietly diverged into three different
// focus behaviours and two different greys — so the same input looked and
// behaved differently depending on which page you were on.
//
// FIELD_CLASS is exported for the many places that render a bare <input> or
// <textarea>; <Field> wraps label + control + help/error for new work.
"use client";

export const FIELD_CLASS =
  "w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 " +
  "placeholder:text-slate-400 transition-colors focus:outline-none focus:border-emerald-500 " +
  "focus:ring-2 focus:ring-emerald-500/15 disabled:opacity-60 disabled:cursor-not-allowed";

export const LABEL_CLASS = "block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

import { Children, cloneElement, isValidElement } from "react";

export default function Field({
  label,
  htmlFor,
  required,
  help,
  error,
  children,
  className = "",
}: {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const helpId = htmlFor ? `${htmlFor}-help` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  // The message was rendered next to the control but never linked to it, so a
  // screen reader announced the field and the error as unrelated fragments —
  // "Insurance expires… edit blank" and, somewhere else entirely, "Enter a date
  // in the future". aria-describedby is what makes them one statement.
  //
  // Only a single element child is decorated; anything else is left untouched
  // rather than guessed at.
  const described = [error ? errorId : null, !error && help ? helpId : null].filter(Boolean).join(" ");
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const control =
    only && isValidElement(only) && htmlFor
      ? cloneElement(only as React.ReactElement<Record<string, unknown>>, {
          "aria-describedby":
            [(only.props as Record<string, unknown>)["aria-describedby"], described]
              .filter(Boolean)
              .join(" ") || undefined,
          "aria-invalid": error ? true : undefined,
          "aria-required": required || undefined,
        })
      : children;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className={LABEL_CLASS}>
          {label}
          {/* Required is marked, not implied — a form where nothing is marked
              teaches the user that nothing is required until submit fails. The
              asterisk is decorative; aria-required carries it to the control. */}
          {required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      {control}
      {error ? (
        <p id={errorId} className="text-[11px] text-rose-600" role="alert">
          {error}
        </p>
      ) : help ? (
        <p id={helpId} className="text-[11px] text-slate-500">
          {help}
        </p>
      ) : null}
    </div>
  );
}
