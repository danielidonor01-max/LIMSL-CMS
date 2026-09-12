// src/components/AuthField.tsx
// The sign-in field treatment, taken from Giov's auth screens.
//
// The distinctive move there is that the fields are NOT three separately
// bordered boxes stacked with gaps. They are one panel, divided by hairlines,
// with the label sitting small and grey directly above its value inside the
// same cell. It reads as a single object to fill in rather than a list of
// controls to visit, which is what a sign-in form actually is.
//
// LIMSL has no sign-up page and is not getting one: accounts are provisioned by
// the Super Admin, because self-registration into a system that carries ISO
// 9001 and 45001 signatures would be an access-control finding. So this is for
// the five screens that do exist — sign in, forgot password, reset password,
// change password, confirm email — each of which previously hand-wrote its own
// field class and had drifted from the others.
"use client";

import { useId } from "react";

export function AuthGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-ink-50 overflow-hidden divide-y divide-ink-200">
      {children}
    </div>
  );
}

export function AuthField({
  label,
  hint,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  required,
  disabled,
  trailing,
  inputMode,
}: {
  label: string;
  /** Right-aligned note on the label row: a rule, not an error. "8+ characters". */
  hint?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** A control pinned to the right of the value row, e.g. show/hide password. */
  trailing?: React.ReactNode;
  inputMode?: "text" | "email" | "numeric" | "tel";
}) {
  const id = useId();
  return (
    // The focus indicator belongs to the CELL, not the bare input.
    //
    // globals.css puts a 2px outline with a 2px offset on every focusable
    // element, with !important, because a missing focus ring is a WCAG 2.4.7
    // failure and that rule was previously defeated by utility classes added in
    // passing. Around a borderless full-width input it draws a rounded box
    // floating inside the cell, visually detached from the label it belongs to.
    //
    // So the outline is suppressed on the input alone and replaced by an inset
    // ring on the cell, which encloses the focused control and its label. That
    // is a stronger indicator than the one it replaces, not a weaker one, which
    // is the only basis on which overriding that rule is defensible.
    <div className="px-4 pt-2.5 pb-2 transition-colors focus-within:bg-surface focus-within:ring-2 focus-within:ring-inset focus-within:ring-brand-500">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-medium text-ink-500">
          {label}
        </label>
        {hint && <span className="text-xs text-ink-400 shrink-0">{hint}</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          disabled={disabled}
          // 16px on purpose, not the 14px the rest of the app uses for inputs.
          // iOS Safari zooms any focused field under 16px and does not zoom
          // back out, and the value being typed here is the one thing on the
          // screen worth reading at size.
          // auth-field-input is declared in globals.css, immediately below the
          // global focus rule it excepts. It is not a Tailwind utility on
          // purpose: the override needs to sit next to the rule it overrides.
          className="auth-field-input w-full bg-transparent border-0 p-0 text-base text-ink-900 placeholder:text-ink-400 focus:ring-0 disabled:text-ink-400"
        />
        {trailing}
      </div>
    </div>
  );
}
