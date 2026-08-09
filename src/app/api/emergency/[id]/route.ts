// src/app/api/emergency/[id]/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emergencyEquipment, emergencyInspections, auditLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";
import { assessReadiness } from "@/lib/hse/emergency";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [item] = await db.select().from(emergencyEquipment).where(eq(emergencyEquipment.id, id)).limit(1);
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const inspections = await db
      .select()
      .from(emergencyInspections)
      .where(eq(emergencyInspections.equipmentId, id))
      .orderBy(desc(emergencyInspections.inspectionDate))
      .limit(60);

    return NextResponse.json({ ...item, readiness: assessReadiness(item), inspections });
  } catch (error) {
    console.error("Failed to fetch emergency item:", error);
    return NextResponse.json({ error: "Failed to fetch emergency item" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [item] = await db.select().from(emergencyEquipment).where(eq(emergencyEquipment.id, id)).limit(1);
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    // Recording an inspection.
    if (body.action === "inspect") {
      const inspectionDate = String(body.inspectionDate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
      if (inspectionDate > new Date().toISOString().slice(0, 10)) {
        return NextResponse.json({ error: "An inspection cannot be dated in the future." }, { status: 400 });
      }
      const verdict = body.verdict === "FAIL" ? "FAIL" : "PASS";
      const findings = String(body.findings ?? "").trim();

      // A failed inspection with no findings is a tick in a box. If the item is
      // not fit for use, someone has to say what is wrong with it.
      if (verdict === "FAIL" && findings.length < 5) {
        return NextResponse.json(
          { error: "Record what is wrong with it, a failed inspection with no finding is not evidence of anything." },
          { status: 400 },
        );
      }

      await db.insert(emergencyInspections).values({
        id: nanoid(),
        equipmentId: id,
        inspectionDate,
        verdict,
        findings: findings || null,
        actionTaken: body.actionTaken || null,
        inspectedById: gate.actor?.id ?? null,
        inspectedByName: gate.actor?.name ?? null,
      });

      // A FAIL takes the item out of service. Leaving it SERVICEABLE would let a
      // failed inspection sit in the history while the headline still counted it
      // as a working control, the exact gap this register exists to close.
      const updates: Record<string, unknown> = {
        lastInspectionDate: inspectionDate,
        updatedAt: new Date().toISOString(),
      };
      if (verdict === "FAIL") updates.status = "DEFECTIVE";
      else if (item.status === "DEFECTIVE") updates.status = "SERVICEABLE"; // repaired and re-checked

      await db.update(emergencyEquipment).set(updates).where(eq(emergencyEquipment.id, id));

      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "emergency_equipment",
        entityId: id,
        entityDescription:
          `${item.tagNumber} inspected ${inspectionDate}, ${verdict}` + (findings ? ` (${findings.slice(0, 80)})` : ""),
      });

      return NextResponse.json({ ok: true, verdict, status: updates.status ?? item.status });
    }

    // Ordinary field edits.
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    for (const k of [
      "tagNumber", "type", "location", "description", "manufacturer",
      "serialNumber", "capacity", "installedDate", "expiryDate", "status", "notes",
    ]) {
      if (body[k] !== undefined) set[k] = body[k] || null;
    }
    if (body.inspectionIntervalDays !== undefined) {
      const n = Number(body.inspectionIntervalDays);
      set.inspectionIntervalDays = Number.isFinite(n) && n > 0 ? n : null;
    }

    if (Object.keys(set).length === 1) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await db.update(emergencyEquipment).set(set).where(eq(emergencyEquipment.id, id));

    if (set.status && set.status !== item.status) {
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "UPDATE",
        entityType: "emergency_equipment",
        entityId: id,
        entityDescription: `${item.tagNumber} status ${item.status} → ${set.status}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update emergency item:", error);
    return NextResponse.json({ error: "Failed to update emergency item" }, { status: 500 });
  }
}
