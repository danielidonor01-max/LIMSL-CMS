// src/components/Modal.tsx
// Lightweight centered dialog used for create/record forms across modules.
// Every confirm and create flow in the app renders through here, so its
// accessibility is the app's accessibility: it announces itself as a dialog,
// closes on Escape and on a backdrop click, keeps Tab inside itself while open,
// returns focus to whatever opened it, and stops the page behind from scrolling
// (which on iOS used to scroll the background instead of the dialog).
"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Callers pass onClose as an inline arrow (`onClose={() => setOpen(false)}`),
  // which is a NEW function on every parent render. With onClose in the effect's
  // dependency array below, every keystroke in the dialog re-rendered the parent,
  // changed the identity of onClose, and so tore the effect down and set it up
  // again. The teardown returns focus to whatever opened the dialog, and the
  // setup then focuses the dialog's first control, so typing one character threw
  // the caret out of the field you were typing in. Every form in the app is a
  // dialog, so every form in the app could only be filled one character per
  // click.
  //
  // The handler is read through a ref instead, so the effect depends only on
  // whether the dialog is open, which is the only thing that should set up or
  // tear down focus management.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Focus the first control so keyboard and screen-reader users start inside
    // the dialog rather than behind it.
    const focusFirst = () => {
      const el = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (el ?? panelRef.current)?.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-lg rounded-xl bg-white border border-slate-200 shadow-2xl my-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-200">
          <div>
            <h3 id={titleId} className="text-sm font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 -m-1.5 min-w-11 min-h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
