// src/app/api/spares/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { spareParts, sparePartMovements, auditLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { applyMovement, MOVEMENT_LABELS } from "@/lib/maintenance/spares";

// The part plus its movement history, a stock figure nobody can explain is a
// stock figure nobody trusts.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [part] = await db.select().from(spareParts).where(eq(spareParts.id, id)).limit(1);
    if (!part) return NextResponse.json({ error: "Spare part not found" }, { status: 404 });

    const movements = await db
      .select()
      .from(sparePartMovements)
      .where(eq(sparePartMovements.sparePartId, id))
      .orderBy(desc(sparePartMovements.createdAt))
      .limit(100);

    return NextResponse.json({ ...part, movements });
  } catch (error) {
    console.error("Failed to fetch spare part:", error);
    return NextResponse.json({ error: "Failed to fetch spare part" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [part] = await db.select().from(spareParts).where(eq(spareParts.id, id)).limit(1);
    if (!part) return NextResponse.json({ error: "Spare part not found" }, { status: 404 });

    // A stock movement is never a blind overwrite of the quantity: the balance
    // is derived, refused if it would go negative, and written to the ledger
    // alongside who did it.
    if (body.movementType) {
      const result = applyMovement(part.quantityOnHand, String(body.movementType), Number(body.quantity));
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

      const movementId = nanoid();
      await db.insert(sparePartMovements).values({
        id: movementId,
        sparePartId: id,
        movementType: String(body.movementType),
        quantity: result.delta,
        balanceAfter: result.balanceAfter,
        reason: body.reason || null,
        workOrderId: body.workOrderId || null,
        performedById: gate.actor?.id ?? null,
        performedByName: gate.actor?.name ?? null,
      });

      await db
        .update(spareParts)
        .set({
          quantityOnHand: result.balanceAfter,
          // Receiving stock closes the order it was raised against.
          ...(body.movementType === "RECEIPT" ? { onOrder: false, onOrderQuantity: null } : {}),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(spareParts.id, id));

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "spare_part",
        entityId: id,
        entityDescription:
          `${part.partNumber} · ${MOVEMENT_LABELS[String(body.movementType)] ?? body.movementType} ` +
          `${Math.abs(result.delta)} → balance ${result.balanceAfter}` +
          (body.reason ? ` (${body.reason})` : ""),
      });

      return NextResponse.json({ ok: true, balanceAfter: result.balanceAfter, movementId });
    }

    // Ordinary field edits.
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    const numField = (key: string) => {
      if (body[key] === undefined) return;
      const n = Number(body[key]);
      set[key] = Number.isFinite(n) && n >= 0 ? n : null;
    };
    for (const k of ["name", "description", "binLocation", "supplierName", "supplierPartNumber", "notes", "expectedDate", "unit", "currency"]) {
      if (body[k] !== undefined) set[k] = body[k] || null;
    }
    for (const k of ["minimumQuantity", "maximumQuantity", "leadTimeDays", "unitCost", "onOrderQuantity"]) numField(k);
    if (body.equipmentId !== undefined) set.equipmentId = body.equipmentId || null;
    if (body.onOrder !== undefined) set.onOrder = !!body.onOrder;

    if (Object.keys(set).length === 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await db.update(spareParts).set(set).where(eq(spareParts.id, id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update spare part:", error);
    return NextResponse.json({ error: "Failed to update spare part" }, { status: 500 });
  }
}
