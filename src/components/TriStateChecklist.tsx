// src/components/TriStateChecklist.tsx
// The tick / cross / not-applicable columns from the paper permit.
//
// A checkbox would lose the distinction the paper form makes. On PTW 4207 some
// lines are ticked, some are crossed, and a cross is a decision that the control
// is not needed here. A blank is nobody having considered the line at all, and
// a permit issued with blanks is a permit whose checklist was never run.
"use client";

import { Check, X, Minus } from "lucide-react";

export type TriState = "YES" | "NO" | "NA";

const OPTIONS: { value: TriState; label: string; icon: typeof Check; on: string }[] = [
  { value: "YES", label: "Required and in place", icon: Check, on: "bg-brand-600 border-brand-600 text-white" },
  { value: "NO", label: "Not required", icon: X, on: "bg-danger-600 border-danger-600 text-white" },
  { value: "NA", label: "Not applicable", icon: Minus, on: "bg-ink-500 border-ink-500 text-white" },
];

export default function TriStateChecklist({
  title,
  hint,
  items,
  value,
  onChange,
  disabled,
  highlightKeys,
}: {
  title: string;
  hint?: string;
  items: readonly { key: string; label: string }[];
  value: Record<string, TriState>;
  onChange: (next: Record<string, TriState>) => void;
  disabled?: boolean;
  // Controls the selected work type makes mandatory, so they read as required
  // rather than as one more line in a list of fourteen.
  highlightKeys?: string[];
}) {
  const set = (key: string, next: TriState) => onChange({ ...value, [key]: next });
  const setAll = (next: TriState) =>
    onChange({ ...value, ...Object.fromEntries(items.map((i) => [i.key, next])) });

  const unmarked = items.filter((i) => !value[i.key]).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {hint && <p className="text-xs text-ink-500 mt-0.5">{hint}</p>}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => setAll("NA")}
            className="text-xs font-semibold text-ink-500 hover:text-ink-900 shrink-0"
          >
            Mark rest N/A
          </button>
        )}
      </div>

      <div className="border border-ink-200 rounded-lg divide-y divide-ink-100 overflow-hidden">
        {items.map((item) => {
          const current = value[item.key];
          const required = highlightKeys?.includes(item.key);
          return (
            <div
              key={item.key}
              className={`flex items-center justify-between gap-3 px-3 py-2 ${
 required && current !== "YES" ? "bg-warn-50" : ""
 }`}
            >
              <span className="text-xs text-ink-700 min-w-0">
                {item.label}
                {required && (
                  <span className="ml-1.5 text-xs font-bold text-warn-700">
                    required
                  </span>
                )}
              </span>
              <div className="flex gap-1 shrink-0">
                {OPTIONS.map((o) => {
                  const Icon = o.icon;
                  const on = current === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => set(item.key, o.value)}
                      aria-pressed={on}
                      aria-label={`${item.label}: ${o.label}`}
                      title={o.label}
                      className={`w-7 h-7 rounded-md border flex items-center justify-center transition-colors disabled:opacity-50 ${
 on ? o.on : "bg-white border-ink-200 text-ink-400 hover:border-ink-300"
 }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {unmarked > 0 && (
        <p className="text-xs text-warn-700 mt-1.5">
          {unmarked} line{unmarked === 1 ? "" : "s"} not yet marked. Every line is ticked or crossed
          before the permit is signed.
        </p>
      )}
    </div>
  );
}
