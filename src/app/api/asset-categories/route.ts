// src/app/api/asset-categories/route.ts
// The asset categories, with how many machines each one governs and whether a
// change to it is waiting for signatures.
//
// Read by anybody signed in, because every screen that names a category or
// lets somebody choose one needs the list. Changing a category is a separate
// route with its own approval chain.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, assetCategoryChanges } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { listCategories } from "@/lib/maintenance/asset-categories";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Retired ones too, marked: a screen showing history needs their names,
    // and the categories page lists them so they can be brought back.
    const categories = await listCategories({ includeRetired: true });
    let machines: { category: string; status: string; removedAt: string | null }[] = [];
    try {
      machines = await db
        .select({ category: equipment.category, status: equipment.status, removedAt: equipment.removedAt })
        .from(equipment);
    } catch (e) {
      console.warn("Could not query equipment for category machine counts:", e);
    }

    let pending: { id: string; changeNumber: string; categoryCode: string }[] = [];
    try {
      pending = await db
        .select({
          id: assetCategoryChanges.id,
          changeNumber: assetCategoryChanges.changeNumber,
          categoryCode: assetCategoryChanges.categoryCode,
        })
        .from(assetCategoryChanges)
        .where(eq(assetCategoryChanges.status, "PENDING_APPROVAL"));
    } catch (e) {
      console.warn("Could not query assetCategoryChanges for pending changes:", e);
    }

    const rows = categories
      .map((c) => ({
        ...c,
        // Machines in service. One removed from the register is not in the
        // category any more, and counting it kept an emptied category from
        // being retired.
        machineCount: machines.filter((m) => m.category === c.code && m.status !== "DECOMMISSIONED" && !m.removedAt).length,
        pendingChange: pending.find((p) => p.categoryCode === c.code) ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return NextResponse.json({ categories: rows });
  } catch (error) {
    console.error("Failed to fetch asset categories:", error);
    return NextResponse.json({ error: "Failed to fetch asset categories" }, { status: 500 });
  }
}
