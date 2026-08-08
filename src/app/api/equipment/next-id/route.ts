// src/app/api/equipment/next-id/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment } from "@/lib/db/schema";
import { nextAssetId, isAssetPrefix, type AssetPrefix } from "@/lib/asset-id";

// The next free asset code for a series. `?prefix=SYS` numbers a facility
// system; anything else defaults to PE. The two series are counted separately —
// generating a SYS code used to be impossible here, which is why facility
// systems were being added by typing an ID and hoping it was free.
export async function GET(request: Request) {
  try {
    const raw = new URL(request.url).searchParams.get("prefix") ?? "PE";
    const prefix: AssetPrefix = isAssetPrefix(raw) ? (raw.toUpperCase() as AssetPrefix) : "PE";

    const rows = await db.select({ assetId: equipment.assetId }).from(equipment);
    return NextResponse.json({
      nextAssetId: nextAssetId(rows.map((r) => r.assetId), prefix),
      prefix,
    });
  } catch (error) {
    console.error("Failed to generate asset id:", error);
    return NextResponse.json({ error: "Failed to generate asset id" }, { status: 500 });
  }
}
