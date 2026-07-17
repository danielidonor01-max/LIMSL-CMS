// src/components/NotificationBell.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

// Topbar bell showing the current user's unread notification count. Polls
// lightly and refreshes on navigation. Renders nothing until mounted so the
// server HTML and first client paint match.
export default function NotificationBell() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    let alive = true;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const d = await res.json();
        if (alive) setUnread(d.unread ?? 0);
      } catch {
        /* ignore */
      }
    };
    fetchCount();
    const t = setInterval(fetchCount, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mounted, pathname]);

  if (!mounted) return null;

  return (
    <Link
      href="/notifications"
      title="Notifications"
      className="relative p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-all"
    >
      <Bell className="w-5 h-5" />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
