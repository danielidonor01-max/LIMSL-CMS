// src/components/AccountMenu.tsx
// The avatar belongs top-right: it is the first place desktop muscle memory
// looks, and on this app that corner was empty while the account control sat at
// the bottom of the sidebar. The sidebar entry stays — it is the only one on
// mobile, where the top bar has no room — so this is an addition, not a move.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { UserCircle, KeyRound, LogOut, ChevronDown } from "lucide-react";
import { ROLE_LABELS } from "@/lib/roles";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

export default function AccountMenu() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account — ${name}`}
        className={`flex items-center gap-2 pl-1 pr-1.5 min-h-10 rounded-lg transition-colors ${
          open ? "bg-slate-100" : "hover:bg-slate-100"
        }`}
      >
        <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center text-[11px] font-bold shrink-0">
          {initialsOf(name)}
        </span>
        <span className="hidden xl:block text-left leading-tight max-w-[10rem]">
          <span className="block text-xs font-semibold text-slate-900 truncate">{name}</span>
          <span className="block text-[10px] text-slate-500 truncate">
            {ROLE_LABELS[user.role ?? ""] ?? user.role}
          </span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
        >
          <div className="px-3 py-2.5 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-900 truncate">{name}</p>
            <p className="text-[11px] text-slate-500 truncate">{ROLE_LABELS[user.role ?? ""] ?? user.role}</p>
          </div>
          <Link
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 min-h-11 text-sm text-slate-700 hover:bg-slate-100"
          >
            <UserCircle className="w-4 h-4 text-slate-400" /> Account &amp; preferences
          </Link>
          <Link
            href="/change-password"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 min-h-11 text-sm text-slate-700 hover:bg-slate-100"
          >
            <KeyRound className="w-4 h-4 text-slate-400" /> Change password
          </Link>
          <div className="my-1 border-t border-slate-100" />
          <button
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="w-full flex items-center gap-2.5 px-3 min-h-11 text-sm text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="w-4 h-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
