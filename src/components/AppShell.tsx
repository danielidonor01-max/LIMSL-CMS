// src/components/AppShell.tsx
"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ShieldAlert } from "lucide-react";
import Sidebar from "./Sidebar";
import GlobalSearch from "./GlobalSearch";
import NotificationBell from "./NotificationBell";
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
  const bare = pathname === "/login" || (status === "authenticated" && mustChange && pathname === "/change-password");

  if (bare) return <>{children}</>;

  const allowed = status !== "authenticated" || canAccessPath(role, pathname);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="no-print h-14 shrink-0 sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center gap-2 px-6">
          <GlobalSearch />
          <QuickActions />
          <NotificationBell />
        </div>
        <div className="flex-1 min-w-0">
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
