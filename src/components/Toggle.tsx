// src/components/Toggle.tsx
// The single on/off switch used for boolean settings across the app, so no page
// ships a raw native checkbox for a preference. (Checklists — where an item is
// genuinely "ticked" — keep real checkboxes; this is for enable/disable state.)
"use client";

export default function Toggle({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
        checked ? "bg-emerald-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}
