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
      setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 176) });
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
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", close);
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
        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 transition-all"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          ref={menuRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 176 }}
          className="z-[100] bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden py-1"
        >
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={i}
                onClick={() => run(item)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-left transition-colors ${
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
