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
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className={LABEL_CLASS}>
          {label}
          {/* Required is marked, not implied — a form where nothing is marked
              teaches the user that nothing is required until submit fails. */}
          {required && <span className="text-rose-500 ml-0.5" aria-hidden="true">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11px] text-rose-600" role="alert">{error}</p>
      ) : help ? (
        <p className="text-[11px] text-slate-400">{help}</p>
      ) : null}
    </div>
  );
}
