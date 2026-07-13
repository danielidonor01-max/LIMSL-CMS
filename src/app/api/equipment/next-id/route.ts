// src/app/api/equipment/next-id/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";

// Generate the next LEE/PE/#### asset code (max existing numeric part + 1).
export async function GET() {
  try {
    const rows = await db.select({ assetId: equipment.assetId }).from(equipment);
    let max = 0;
    for (const r of rows) {
      const m = (r.assetId || "").match(/^LEE\/PE\/(\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    const next = `LEE/PE/${String(max + 1).padStart(4, "0")}`;
    return NextResponse.json({ nextAssetId: next });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to generate asset id:", error);
    return NextResponse.json({ error: "Failed to generate asset id", details: message }, { status: 500 });
  }
}
