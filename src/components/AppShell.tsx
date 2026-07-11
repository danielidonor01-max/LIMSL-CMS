// src/components/AppShell.tsx
"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import GlobalSearch from "./GlobalSearch";

// Global chrome: left vertical sidebar + top bar with global search.
// The login page renders bare (no chrome).
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare = pathname === "/login";

  if (bare) return <>{children}</>;

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="no-print h-14 shrink-0 sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md flex items-center gap-4 px-6">
          <GlobalSearch />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
