// src/app/api/work-orders/mine/route.ts
// The jobs assigned to the signed-in person. /work-orders has status and type
// filters but no "mine", so a technician had to scan a seven-column table of
// everyone's work to find their own, on a phone, sideways.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workOrders, equipment } from "@/lib/db/schema";
import { and, eq, ne, desc } from "drizzle-orm";
import { auth } from "@/auth";

export async function GET() {
  try {
    const session = await auth();
    const user = session?.user as { id?: string } | undefined;
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rows = await db
      .select({
        id: workOrders.id,
        workOrderNumber: workOrders.workOrderNumber,
        type: workOrders.type,
        status: workOrders.status,
        priority: workOrders.priority,
        title: workOrders.title,
        plannedDate: workOrders.plannedDate,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
        location: equipment.location,
      })
      .from(workOrders)
      .leftJoin(equipment, eq(workOrders.equipmentId, equipment.id))
      .where(
        and(
          eq(workOrders.technicianId, user.id),
          ne(workOrders.status, "COMPLETED"),
          ne(workOrders.status, "CANCELLED"),
        ),
      )
      .orderBy(desc(workOrders.plannedDate));

    const today = new Date().toISOString().slice(0, 10);
    const items = rows.map((w) => ({ ...w, overdue: !!w.plannedDate && w.plannedDate < today }));
    return NextResponse.json({
      items,
      openCount: items.length,
      overdueCount: items.filter((i) => i.overdue).length,
    });
  } catch (error) {
    console.error("Failed to fetch my work orders:", error);
    return NextResponse.json({ error: "Failed to load your work" }, { status: 500 });
  }
}
