// src/components/Tooltip.tsx
// Replaces the native `title` attribute on icon-only controls.
//
// A browser tooltip waits about a second, cannot be styled, never appears on
// touch, and is not announced by screen readers, so on an icon-only button it
// is the only label, delivered late, to some users and not others. This shows
// on hover AND on keyboard focus, immediately, and pairs with a real
// aria-label on the trigger.
"use client";

import { useState } from "react";

export default function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: React.ReactNode;
  side?: "bottom" | "left";
}) {
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocusCapture={() => setShow(true)}
      onBlurCapture={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white shadow-sm ${
            side === "bottom"
              ? "top-full left-1/2 -translate-x-1/2 mt-1.5"
              : "right-full top-1/2 -translate-y-1/2 mr-2"
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
