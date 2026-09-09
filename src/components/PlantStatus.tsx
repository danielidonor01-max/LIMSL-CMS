// src/components/PlantStatus.tsx
// The state of the plant, in the top bar, on every screen.
//
// The reference product carries a "● Live" pill up here. That one is
// decoration: it says the service is up, which it always is, so nobody reads
// it after the first day. The same slot is worth far more in a maintenance
// system, because there is a fact that genuinely changes through the day and
// that everyone on every screen wants: is anything down.
//
// So it is the same shape borrowed for a different reason. It reads "All
// running" or "2 machines down", and it is a link, because the only useful
// response to the second one is to go and look.
"use client";

import Link from "next/link";
import { useApi } from "@/lib/api-cache";

type Equip = { status: string };

export default function PlantStatus() {
  const { data, loading } = useApi<Equip[]>("/api/equipment", []);
  const rows = Array.isArray(data) ? data : [];

  // Nothing at all until it is known. A pill that says "All running" while it
  // is still loading is a pill that has lied at least once, and after that it
  // cannot be trusted on the morning it matters.
  if (loading || rows.length === 0) return null;

  const down = rows.filter((e) => e.status === "BROKEN_DOWN").length;
  const clear = down === 0;

  return (
    <Link
      href={clear ? "/equipment" : "/corrective"}
      aria-label={clear ? "All machines running" : `${down} machines down, open corrective records`}
      className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors ${
        clear
          ? "border-line bg-surface text-ink-600 hover:bg-ink-100"
          : "border-danger-200 bg-danger-50 text-danger-700 hover:bg-danger-100"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${clear ? "bg-brand-500" : "bg-danger-500"}`}
        aria-hidden="true"
      />
      {clear ? "All running" : `${down} down`}
    </Link>
  );
}
