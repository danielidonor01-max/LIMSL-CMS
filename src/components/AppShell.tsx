// src/components/AppShell.tsx
"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ShieldAlert, Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import OfflineBanner from "./OfflineBanner";
import OutboxTray from "./OutboxTray";
import GlobalSearch from "./GlobalSearch";
import NotificationBell from "./NotificationBell";
import AccountMenu from "./AccountMenu";
import QuickActions from "./QuickActions";
import { canAccessPath, ROLE_LABELS } from "@/lib/roles";

// Global chrome: left vertical sidebar + top bar with global search.
// The login page renders bare (no chrome). Pages the current role may not access
// render an "access restricted" notice instead of the page.
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const mustChange = (session?.user as { mustChangePassword?: boolean })?.mustChangePassword;
  const bare = pathname === "/offline" || pathname === "/login" || pathname === "/forgot-password" || pathname === "/reset-password" || pathname === "/account/confirm-email" || (status === "authenticated" && mustChange && pathname === "/change-password");

  const [navOpen, setNavOpen] = useState(false);
  // Close the mobile drawer whenever the route changes.
  useEffect(() => setNavOpen(false), [pathname]);

  if (bare) return <>{children}</>;

  const allowed = status !== "authenticated" || canAccessPath(role, pathname);

  return (
    <div className="flex min-h-screen">
      {/* A keyboard user was tabbing through every sidebar link on every page
          load before reaching the content. Visible only on focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-emerald-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <OfflineBanner />
        <OutboxTray />
        {/* Search anchors left, actions anchor right. Everything used to sit in
            one left-hugging run with no spacer, so on a wide screen the content
            clustered into the first third and the rest of the bar was void,             which is what read as disorganised. The right cluster is grouped and
            separated from the passive indicator by a rule, so a primary action,
            a notification and an account control are not three equal things. */}
        <header className="no-print h-14 shrink-0 sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center gap-3 px-4 lg:px-6">
          <button
            onClick={() => setNavOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <GlobalSearch />

          <div className="ml-auto flex items-center gap-2">
            <QuickActions />
            <span className="hidden sm:block w-px h-6 bg-slate-200" aria-hidden="true" />
            <NotificationBell />
            <AccountMenu />
          </div>
        </header>
        <div id="main-content" tabIndex={-1} className="flex-1 min-w-0">
          {allowed ? (
            children
          ) : (
            <div className="p-10 max-w-md mx-auto text-center space-y-3">
              <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto" />
              <h2 className="text-lg font-bold text-slate-900">Access restricted</h2>
              <p className="text-sm text-slate-500">
                Your role (<span className="font-semibold">{ROLE_LABELS[role ?? ""] ?? role}</span>) doesn&apos;t have access to this page.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
