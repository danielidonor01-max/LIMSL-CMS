// src/app/api/spares/movements/route.ts
// Stock movements, filterable by the job they were issued to. This is what makes
// "what did this machine actually consume" answerable, which a free-text
// "spare parts needed" box never could.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sparePartMovements, spareParts } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workOrderId = new URL(request.url).searchParams.get("workOrderId");
    if (!workOrderId) {
      return NextResponse.json({ error: "A work order is required." }, { status: 400 });
    }

    const rows = await db
      .select({
        id: sparePartMovements.id,
        quantity: sparePartMovements.quantity,
        balanceAfter: sparePartMovements.balanceAfter,
        reason: sparePartMovements.reason,
        performedByName: sparePartMovements.performedByName,
        createdAt: sparePartMovements.createdAt,
        partNumber: spareParts.partNumber,
        partName: spareParts.name,
      })
      .from(sparePartMovements)
      .leftJoin(spareParts, eq(sparePartMovements.sparePartId, spareParts.id))
      .where(eq(sparePartMovements.workOrderId, workOrderId))
      .orderBy(desc(sparePartMovements.createdAt));

    return NextResponse.json({ movements: rows });
  } catch (error) {
    console.error("Failed to fetch part movements:", error);
    return NextResponse.json({ error: "Failed to fetch part movements" }, { status: 500 });
  }
}
