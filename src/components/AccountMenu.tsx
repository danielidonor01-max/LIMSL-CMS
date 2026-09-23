// src/components/AccountMenu.tsx
// The account control, and there is one of it.
//
// It was in two places at once: a chip at the top of the sidebar showing the
// name and role, and an avatar in the top-right showing the same name and the
// same role again, a few hundred pixels apart on the same screen. Two controls
// that say the same thing do not reinforce each other; they read as an
// interface that has not decided, and the top bar paid for it in space.
//
// So it lives in the sidebar, at the foot of the column, which is where the
// account sits in most software and where it was already half-living. The top
// bar keeps search, quick actions and notifications — the things you reach for
// while working — and gets the room back.
//
// The menu opens upward, because the trigger is at the bottom of the screen.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { UserCircle, KeyRound, LogOut, ChevronUp } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

export default function AccountMenu({
  narrow = false,
  onNavigate,
}: {
  /** The collapsed icon rail: initials only, name and role in the menu. */
  narrow?: boolean;
  /** Closes the mobile drawer when a menu item is followed. */
  onNavigate?: () => void;
}) {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Renders nothing until the session resolves client-side, so the server HTML
  // and first paint match (the hydration trap this codebase has hit before).
  if (!mounted || !session?.user) return null;

  const user = session.user as { name?: string; role?: string };
  const name = user.name ?? "Account";
  const roleLabel = ROLE_LABELS[user.role ?? ""] ?? user.role ?? "LEE International";

  const close = () => {
    setOpen(false);
    onNavigate?.();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        ref={triggerRef}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={narrow ? `${name}, ${roleLabel}` : undefined}
        aria-label={`Account, ${name}, ${roleLabel}`}
        className={`w-full flex items-center gap-2.5 rounded-lg py-2.5 transition-colors ${
 open ? "bg-nav-active" : "bg-nav-raised hover:bg-nav-active"
 } ${narrow ? "px-3 lg:px-0 lg:justify-center" : "px-3"}`}
      >
        <span className="w-7 h-7 rounded-lg bg-brand-600 text-white grid place-items-center text-xs font-bold shrink-0">
          {initialsOf(name)}
        </span>
        {/* sr-only rather than hidden on the rail. The column shows initials,
            which a screen reader announces as "DI", and the whole point of this
            block is to say whose name is about to go on the record. */}
        <span className={`min-w-0 flex-1 text-left ${narrow ? "lg:sr-only" : ""}`}>
          <span className="block text-xs font-semibold text-white truncate leading-tight">{name}</span>
          <span className="block text-xs text-nav-label truncate leading-tight mt-0.5">{roleLabel}</span>
        </span>
        <ChevronUp
          className={`w-3.5 h-3.5 text-nav-label shrink-0 transition-transform ${open ? "" : "rotate-180"} ${
 narrow ? "lg:hidden" : ""
 }`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute bottom-full left-3 mb-2 w-56 bg-surface border border-line rounded-xl shadow-raised overflow-hidden z-50"
        >
          <div className="px-3 py-2.5 border-b border-line">
            <p className="text-sm font-semibold text-ink-900 truncate">{name}</p>
            <p className="text-xs text-ink-500 truncate">{roleLabel}</p>
          </div>
          <Link
            href="/account"
            role="menuitem"
            onClick={close}
            className="flex items-center gap-2.5 px-3 min-h-11 text-sm text-ink-700 hover:bg-ink-100"
          >
            <UserCircle className="w-4 h-4 text-ink-400" /> Account &amp; preferences
          </Link>
          <Link
            href="/change-password"
            role="menuitem"
            onClick={close}
            className="flex items-center gap-2.5 px-3 min-h-11 text-sm text-ink-700 hover:bg-ink-100"
          >
            <KeyRound className="w-4 h-4 text-ink-400" /> Change password
          </Link>
          <div className="border-t border-line" />
          <button
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2.5 px-3 min-h-11 text-sm text-danger-600 hover:bg-danger-50"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
