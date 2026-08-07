// src/components/TableSkeleton.tsx
// Sixty-seven bare spinners across the app, several narrating internal jargon
// ("Loading Sealed Assets Twin Database..."). A skeleton that matches the
// layout about to appear reads as faster than a spinner, and doesn't collapse
// the page to a dot while it waits.
"use client";

export default function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="p-4 space-y-3" aria-busy="true" aria-label="Loading">
      <div className="flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-slate-100 rounded animate-pulse" style={{ width: `${100 / cols}%` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 items-center">
          {Array.from({ length: cols }).map((_, c) => (
            <div
              key={c}
              className="h-4 bg-slate-100 rounded animate-pulse"
              // Vary the widths a little so it reads as content, not a grid.
              style={{ width: `${100 / cols}%`, opacity: 1 - r * 0.12 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
