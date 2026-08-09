// src/app/api/equipment/locations/route.ts
// The location picklist, derived from the register itself, no separate table
// to drift from reality. Free-typed "Bay 3" / "bay3" fragmented transfer
// history and filters; offering what's already in use converges them without
// blocking a genuinely new location (the UI keeps an "Other" escape hatch).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";

export async function GET() {
  try {
    const rows = await db.select({ location: equipment.location }).from(equipment);
    const seen = new Map<string, string>(); // lowercase key → first-seen spelling
    for (const r of rows) {
      const v = (r.location ?? "").trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (!seen.has(k)) seen.set(k, v);
    }
    const locations = [...seen.values()].sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ locations });
  } catch (error) {
    console.error("Failed to list locations:", error);
    return NextResponse.json({ locations: [] });
  }
}
