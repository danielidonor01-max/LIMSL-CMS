// src/components/LocationField.tsx
// Location entry that converges spellings: pick one already in use, or choose
// "Other / new location…" and type a genuinely new one. Wraps the shared Select
// so no native dropdown appears, and emits a plain string so every existing
// submit payload shape is unchanged.
"use client";

import { useEffect, useState } from "react";
import Select from "@/components/Select";

const OTHER = "__other__";

export default function LocationField({
  value,
  onChange,
  className = "",
  placeholder = "Select a location…",
  ariaLabel = "Location",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [known, setKnown] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [freeform, setFreeform] = useState(false);

  useEffect(() => {
    fetch("/api/equipment/locations")
      .then((r) => (r.ok ? r.json() : { locations: [] }))
      .then((d) => setKnown(Array.isArray(d.locations) ? d.locations : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // An existing value that isn't in the register's list (legacy import, or a
  // location since renamed) must stay editable rather than silently reset.
  useEffect(() => {
    if (!loaded) return;
    if (value && !known.some((k) => k.toLowerCase() === value.toLowerCase())) setFreeform(true);
  }, [loaded, value, known]);

  if (freeform) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="New location name…"
          aria-label={ariaLabel}
          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
        />
        {known.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setFreeform(false);
              onChange("");
            }}
            className="text-[11px] text-emerald-600 hover:underline"
          >
            Choose an existing location instead
          </button>
        )}
      </div>
    );
  }

  return (
    <Select
      className={className}
      ariaLabel={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(v) => {
        if (v === OTHER) {
          setFreeform(true);
          onChange("");
          return;
        }
        onChange(v);
      }}
    >
      {known.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
      <option value={OTHER}>Other / new location…</option>
    </Select>
  );
}
