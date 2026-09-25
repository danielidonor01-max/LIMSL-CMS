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

    const categories = await listCategories();
    const machines = await db.select({ category: equipment.category, status: equipment.status }).from(equipment);
    const pending = await db
      .select({
        id: assetCategoryChanges.id,
        changeNumber: assetCategoryChanges.changeNumber,
        categoryCode: assetCategoryChanges.categoryCode,
      })
      .from(assetCategoryChanges)
      .where(eq(assetCategoryChanges.status, "PENDING_APPROVAL"));

    const rows = categories
      .map((c) => ({
        ...c,
        machineCount: machines.filter((m) => m.category === c.code && m.status !== "DECOMMISSIONED").length,
        pendingChange: pending.find((p) => p.categoryCode === c.code) ?? null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return NextResponse.json({ categories: rows });
  } catch (error) {
    console.error("Failed to fetch asset categories:", error);
    return NextResponse.json({ error: "Failed to fetch asset categories" }, { status: 500 });
  }
}
