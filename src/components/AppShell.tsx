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
import QuickActions from "./QuickActions";
import PlantStatus from "./PlantStatus";
import { canAccessPath, ROLE_LABELS } from "@/lib/roles";
import { pageTitle } from "@/lib/page-title";

// Same maximum width and side padding as PAGE_MAIN.register, so the bar's
// left edge IS the page's left edge. Kept next to the shell rather than
// re-derived by eye, which is how it drifted in the first place.
const TOPBAR_INNER = "h-full max-w-7xl w-full mx-auto px-6 lg:px-8 flex items-center gap-4";

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

  // Name the browser tab. Every page inherited the root title, so anyone
  // working with the schedule, a work order and a permit open at once was
  // choosing between identical labels by remembering which tab was which.
  // These are client components and cannot export Next's metadata, so it is set
  // on navigation instead.
  useEffect(() => {
    document.title = pageTitle(pathname);
  }, [pathname]);

  if (bare) return <>{children}</>;

  const allowed = status !== "authenticated" || canAccessPath(role, pathname);

  return (
    <div className="flex min-h-screen">
      {/* A keyboard user was tabbing through every sidebar link on every page
          load before reaching the content. Visible only on focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to main content
      </a>
      <Sidebar mobileOpen={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 min-w-0 flex flex-col">
        <OfflineBanner />
        <OutboxTray />
        {/* The bar's contents sit in the same column as the page beneath it —
            the widest one, the register width — with the same side padding. So
            the search starts exactly where the page title and its back link
            start, and the controls end where the page's right edge ends.

            It used to centre the search across the whole bar, which lined it
            up with nothing: on a register the search floated right of the
            title, and on a narrower page it floated somewhere else again.

            The account control is NOT here: it lives at the foot of the
            sidebar, which already carried the same name and role. */}
        <header className="no-print h-16 shrink-0 sticky top-0 z-30 border-b border-line bg-surface">
          <div className={TOPBAR_INNER}>
            <button
              onClick={() => setNavOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-ink-500 hover:text-ink-900 hover:bg-ink-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0">
              <div className="w-full max-w-xl">
                <GlobalSearch />
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <PlantStatus />
              <QuickActions />
              <span className="hidden sm:block w-px h-6 bg-line" aria-hidden="true" />
              <NotificationBell />
            </div>
          </div>
        </header>
        <div id="main-content" tabIndex={-1} className="flex-1 min-w-0">
          {allowed ? (
            children
          ) : (
            <div className="p-10 max-w-md mx-auto text-center space-y-3">
              <ShieldAlert className="w-10 h-10 text-danger-500 mx-auto" />
              <h2 className="text-xl font-bold text-ink-900">Access restricted</h2>
              <p className="text-sm text-ink-500">
                Your role (<span className="font-semibold">{ROLE_LABELS[role ?? ""] ?? role}</span>) doesn&apos;t have access to this page.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
