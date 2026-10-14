// src/components/SettingsNav.tsx
// Cohesive top navigation for the settings suite.
//
// Unifies App Settings, Users & Roles, Asset Categories, and Data Import into a
// single, clear Giov-style navigation bar across administrative and governance screens.
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SlidersHorizontal, Users, Tags, Database } from "lucide-react";
import { useSession } from "next-auth/react";
import { canAccessPath } from "@/lib/roles";

type SettingsNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

const ITEMS: SettingsNavItem[] = [
  { href: "/settings", label: "App Settings", icon: SlidersHorizontal, exact: true },
  { href: "/settings/users", label: "Users & Roles", icon: Users },
  { href: "/settings/categories", label: "Asset Categories", icon: Tags },
  { href: "/settings/import", label: "Data Import", icon: Database },
];

export default function SettingsNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  const accessibleItems = ITEMS.filter((item) => canAccessPath(role, item.href));

  if (accessibleItems.length <= 1) return null;

  return (
    <nav
      className="flex items-center gap-6 border-b border-line mb-6 overflow-x-auto"
      aria-label="Settings sections"
    >
      {accessibleItems.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`relative -mb-px flex items-center gap-2 border-b-2 pb-2.5 pt-1 text-sm transition-colors whitespace-nowrap ${
              active
                ? "border-brand-600 text-ink-900 font-semibold"
                : "border-transparent text-ink-500 font-medium hover:text-ink-900"
            }`}
          >
            <Icon className={`w-4 h-4 ${active ? "text-brand-600" : "text-ink-400"}`} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
