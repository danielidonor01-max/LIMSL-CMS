// src/app/api/asset-categories/move/route.ts
// POST → move one or many machines to another category.
//
// Each machine takes the new category's interval and its untouched future plan
// is rebuilt on that category's calendar (replanMachine). The move is written
// to the audit log once and to each machine's history.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog, equipment, maintenanceSchedule, pmBatches } from "@/lib/db/schema";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { EQUIPMENT_MOVE_ROLES } from "@/lib/roles";
import { carryPlanOnMove, getCategory, replanMachine } from "@/lib/maintenance/asset-categories";
import { logEquipmentEvent } from "@/lib/equipment-log";
import { planCategoryMove, validateMoveRequest } from "@/lib/maintenance/category-move";

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(EQUIPMENT_MOVE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const problem = validateMoveRequest(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const toCode = String(body.toCategory).trim();
    const target = await getCategory(toCode);
    if (!target || target.isActive === false) {
      return NextResponse.json({ error: "That category is not on the register." }, { status: 400 });
    }

    const ids = [...new Set(body.equipmentIds as string[])];
    const machines = await db.select().from(equipment).where(inArray(equipment.id, ids));
    if (machines.length === 0) return NextResponse.json({ error: "None of those machines were found." }, { status: 404 });

    // A batch belongs to the category it was raised for, so a machine on an
    // open one stays put until that batch is finished.
    const batched = await db
      .select({ equipmentId: maintenanceSchedule.equipmentId, status: pmBatches.status })
      .from(maintenanceSchedule)
      .innerJoin(pmBatches, eq(maintenanceSchedule.batchId, pmBatches.id))
      .where(and(inArray(maintenanceSchedule.equipmentId, ids), isNotNull(maintenanceSchedule.batchId)));
    const inOpenBatch = new Set<string>(
      batched
        .filter((b: { status: string }) => b.status !== "COMPLETED" && b.status !== "CANCELLED")
        .map((b: { equipmentId: string }) => b.equipmentId),
    );

    const { movable, refused } = planCategoryMove(machines, toCode, inOpenBatch);
    const categories = new Map<string, string>();
    const labelOf = async (code: string) => {
      if (!categories.has(code)) categories.set(code, (await getCategory(code))?.label ?? code);
      return categories.get(code)!;
    };

    const now = new Date().toISOString();
    const moved: { id: string; name: string | null; from: string; removed: number; added: number }[] = [];
    for (const m of movable) {
      const full = machines.find((x: typeof equipment.$inferSelect) => x.id === m.id)!;
      // Before the machine changes hands: its past stays, what it owes goes with it.
      await carryPlanOnMove(m.id, m.category, toCode);
      const [after] = await db
        .update(equipment)
        .set({ category: toCode, maintenanceFrequency: target.maintenanceFrequency, updatedAt: now })
        .where(eq(equipment.id, m.id))
        .returning();
      let plan = { removed: 0, added: 0 };
      try {
        plan = await replanMachine(after ?? { ...full, category: toCode, maintenanceFrequency: target.maintenanceFrequency }, gate.actor);
      } catch (err) {
        console.warn("category move: could not rebuild the plan for", m.id, err);
      }
      moved.push({ id: m.id, name: m.name, from: m.category, ...plan });
      try {
        await logEquipmentEvent({
          equipmentId: m.id,
          category: "OTHER",
          title: `Moved from ${await labelOf(m.category)} to ${target.label}`,
          detail: `Now serviced on the ${target.label} schedule. ${plan.removed} untouched future visit(s) replaced by ${plan.added} on the new calendar.`,
          source: "AUTO",
          performedById: gate.actor?.id ?? null,
          performedByName: gate.actor?.name ?? null,
        });
      } catch (err) {
        console.warn("category move: history line failed (non-fatal)", err);
      }
    }

    if (moved.length) {
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "asset_category",
        entityId: toCode,
        entityDescription: `${moved.length} machine(s) moved to ${target.label}${body.reason ? `: ${String(body.reason).slice(0, 200)}` : ""}`,
        changes: JSON.stringify(moved),
      });
    }

    return NextResponse.json({ moved, refused, toLabel: target.label });
  } catch (error) {
    console.error("Failed to move equipment between categories:", error);
    return NextResponse.json({ error: "Failed to move the equipment" }, { status: 500 });
  }
}
