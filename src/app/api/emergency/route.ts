// src/app/api/emergency/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emergencyEquipment, emergencyDrills, auditLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";
import {
  assessReadiness,
  readinessSummary,
  drillProgrammeStatus,
  drillFollowUp,
  intervalFor,
} from "@/lib/hse/emergency";

// The register plus the drill programme, with readiness already computed, // "how many extinguishers" and "how many working extinguishers" must never be
// answerable differently by two callers.
export async function GET() {
  try {
    const [items, drills] = await Promise.all([
      db.select().from(emergencyEquipment),
      db.select().from(emergencyDrills).orderBy(desc(emergencyDrills.drillDate)).limit(100),
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const withReadiness = items
      .map((i) => ({ ...i, readiness: assessReadiness(i, today) }))
      .sort((a, b) => {
        const order = { fail: 0, warn: 1, ok: 2 } as Record<string, number>;
        return (
          (order[a.readiness.severity] ?? 3) - (order[b.readiness.severity] ?? 3) ||
          a.location.localeCompare(b.location) ||
          a.tagNumber.localeCompare(b.tagNumber)
        );
      });

    return NextResponse.json({
      items: withReadiness,
      summary: readinessSummary(items, today),
      drills,
      drillProgramme: drillProgrammeStatus(
        drills.filter((d) => d.drillType === "FIRE_EVACUATION"),
        365,
        today,
      ),
      drillFollowUp: drillFollowUp(drills),
    });
  } catch (error) {
    console.error("Failed to fetch emergency register:", error);
    return NextResponse.json({ error: "Failed to fetch emergency register" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    // A drill record and an equipment record arrive on the same endpoint; the
    // caller says which.
    if (body.kind === "DRILL") {
      const drillDate = String(body.drillDate ?? "").slice(0, 10);
      if (!drillDate || drillDate > new Date().toISOString().slice(0, 10)) {
        return NextResponse.json(
          { error: "Give the date the drill was actually held, it cannot be in the future." },
          { status: 400 },
        );
      }
      const row = {
        id: nanoid(),
        drillType: String(body.drillType || "FIRE_EVACUATION"),
        drillDate,
        location: body.location || null,
        scenario: body.scenario || null,
        participantCount: Number(body.participantCount) > 0 ? Number(body.participantCount) : null,
        evacuationMinutes: Number(body.evacuationMinutes) > 0 ? Number(body.evacuationMinutes) : null,
        observations: body.observations || null,
        deficiencies: body.deficiencies || null,
        correctiveActions: body.correctiveActions || null,
        conductedById: gate.actor?.id ?? null,
        conductedByName: gate.actor?.name ?? null,
      };
      await db.insert(emergencyDrills).values(row);
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name || "System",
        action: "CREATE",
        entityType: "emergency_drill",
        entityId: row.id,
        entityDescription: `${row.drillType} drill recorded for ${row.drillDate}`,
      });
      return NextResponse.json(row, { status: 201 });
    }

    const tagNumber = String(body.tagNumber ?? "").trim();
    const location = String(body.location ?? "").trim();
    if (!tagNumber || !location || !body.type) {
      return NextResponse.json(
        { error: "A tag number, a type and a location are required, an item nobody can find is not a control." },
        { status: 400 },
      );
    }

    const row = {
      id: nanoid(),
      tagNumber,
      type: String(body.type),
      location,
      description: body.description || null,
      manufacturer: body.manufacturer || null,
      serialNumber: body.serialNumber || null,
      capacity: body.capacity || null,
      installedDate: body.installedDate || null,
      lastInspectionDate: body.lastInspectionDate || null,
      inspectionIntervalDays:
        Number(body.inspectionIntervalDays) > 0 ? Number(body.inspectionIntervalDays) : intervalFor(body.type),
      expiryDate: body.expiryDate || null,
      status: body.status || "SERVICEABLE",
      notes: body.notes || null,
    };

    await db.insert(emergencyEquipment).values(row);
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "emergency_equipment",
      entityId: row.id,
      entityDescription: `${row.tagNumber} · ${row.type} at ${row.location} added to the emergency register`,
    });

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("Failed to create emergency record:", error);
    return NextResponse.json({ error: "Failed to create emergency record" }, { status: 500 });
  }
}
