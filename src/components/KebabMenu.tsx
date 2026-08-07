// src/components/KebabMenu.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";

export type KebabItem = {
  label: string;
  icon?: React.ElementType;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
};

// Kebab (⋮) trigger opening a small fixed-position menu, so it is never
// clipped by a scrolling table container.
export default function KebabMenu({ items, ariaLabel = "Row actions" }: { items: KebabItem[]; ariaLabel?: string }) {
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // Flip above the trigger when the menu would run past the bottom edge
      // (last table rows), and clamp inside the viewport either way.
      // Rows are min-h-11 (44px) for touch; keep this in step or the flip
      // decision misjudges and the menu still runs off the bottom.
      const estHeight = items.length * 44 + 10;
      const below = r.bottom + 4;
      const top =
        below + estHeight > window.innerHeight - 8
          ? Math.max(8, r.top - 4 - estHeight)
          : below;
      setPos({ top, left: Math.max(8, Math.min(r.right - 176, window.innerWidth - 176 - 8)) });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    // Escape must close a menu — without it a keyboard user who opens one has
    // no way out but to tab through every item.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const run = (item: KebabItem) => {
    setOpen(false);
    if (item.onClick) item.onClick();
    else if (item.href) router.push(item.href);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 min-w-11 min-h-11 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 176 }}
          role="menu"
          className="z-[100] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden py-1"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                role="menuitem"
                onClick={() => run(item)}
                className={`w-full flex items-center gap-2.5 px-3 min-h-11 text-xs font-medium text-left transition-colors ${
                  item.danger
                    ? "text-rose-600 hover:bg-rose-50"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
