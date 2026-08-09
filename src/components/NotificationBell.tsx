// src/components/NotificationBell.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useUserPrefs } from "@/components/PreferencesProvider";
import Tooltip from "@/components/Tooltip";

// Topbar bell showing the current user's unread notification count. Polls
// lightly and refreshes on navigation. Renders nothing until mounted so the
// server HTML and first client paint match. Honours the per-user "in-app
// notifications" preference: when off, the bell stays (the inbox remains
// reachable) but the badge is hidden and polling stops.
export default function NotificationBell() {
  const pathname = usePathname();
  const { prefs } = useUserPrefs();
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(0);
  // Previous count for new-arrival detection; null until the first poll so a
  // page load with existing unread doesn't chime.
  const prevUnread = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  // A short two-tone chime via WebAudio, no audio asset to ship or load.
  const chime = () => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const gain = ctx.createGain();
      gain.gain.value = 0.06;
      gain.connect(ctx.destination);
      [880, 1175].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(gain);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.15);
      });
      setTimeout(() => ctx.close(), 600);
    } catch {
      /* audio blocked, fine */
    }
  };

  const announce = (count: number, delta: number) => {
    if (prefs.notifySound) chime();
    if (prefs.notifyDesktop && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("LIMSL CMS", {
          body: `${delta} new notification${delta > 1 ? "s" : ""}, ${count} unread`,
          tag: "limsl-cms-inbox",
        });
      } catch {
        /* blocked, fine */
      }
    }
  };

  useEffect(() => {
    if (!mounted || !prefs.notifyInApp) return;
    let alive = true;
    const fetchCount = async () => {
      try {
        const res = await fetch("/api/notifications?countOnly=1");
        if (!res.ok) return;
        const d = await res.json();
        if (!alive) return;
        const next = d.unread ?? 0;
        if (prevUnread.current !== null && next > prevUnread.current) {
          announce(next, next - prevUnread.current);
        }
        prevUnread.current = next;
        setUnread(next);
      } catch {
        /* ignore */
      }
    };
    fetchCount();
    const t = setInterval(fetchCount, 60_000);

    // Coming back to the tab is the moment the count is most likely stale and
    // the user is most likely to look at it; waiting up to a minute reads as the
    // badge being wrong.
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchCount();
    };
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [mounted, pathname, prefs.notifyInApp]);

  if (!mounted) return null;

  return (
    // The native `title` waited a second, could not be styled, never appeared
    // on touch, and was not announced, on an icon-only control that was the
    // only label, delivered late and to some users only.
    <Tooltip label={unread > 0 ? `${unread} unread` : "Notifications"}>
      <Link
        href="/notifications"
        // The count is carried in colour and position only; a screen reader
        // otherwise hears "Notifications" whether there are none or nine.
        aria-label={
          prefs.notifyInApp && unread > 0
            ? `Notifications, ${unread} unread`
            : "Notifications, none unread"
        }
        className="relative grid place-items-center w-10 h-10 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {prefs.notifyInApp && unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </Tooltip>
  );
}
