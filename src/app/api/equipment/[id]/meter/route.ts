// src/app/api/equipment/[id]/meter/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, meterReadings, auditLog } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import {
  meterState,
  usageRatePerDay,
  projectedDueDate,
  validateReading,
  isMeterUnit,
} from "@/lib/maintenance/meters";
import { logEquipmentEvent } from "@/lib/equipment-log";

// The meter, its readings, and what they mean — computed server-side so the
// twin, the schedule and any report can never disagree about whether a service
// is due.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const [eq0] = await db.select().from(equipment).where(eq(equipment.id, id)).limit(1);
    if (!eq0) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const readings = await db
      .select()
      .from(meterReadings)
      .where(eq(meterReadings.equipmentId, id))
      .orderBy(desc(meterReadings.readingDate))
      .limit(60);

    const state = meterState(eq0.currentMeter, eq0.meterAtLastService, eq0.meterServiceInterval);
    // Readings before a reset describe a different meter, so a rate spanning one
    // would be meaningless.
    const lastReset = readings.find((r) => r.isReset);
    const forRate = lastReset ? readings.filter((r) => r.readingDate >= lastReset.readingDate) : readings;
    const rate = usageRatePerDay(forRate.map((r) => ({ reading: r.reading, readingDate: r.readingDate })));

    return NextResponse.json({
      equipmentId: id,
      meterUnit: eq0.meterUnit,
      currentMeter: eq0.currentMeter,
      meterUpdatedAt: eq0.meterUpdatedAt,
      meterServiceInterval: eq0.meterServiceInterval,
      meterAtLastService: eq0.meterAtLastService,
      state,
      usagePerDay: rate,
      projectedDueDate: projectedDueDate(state.remaining, rate),
      readings,
    });
  } catch (error) {
    console.error("Failed to load meter:", error);
    return NextResponse.json({ error: "Failed to load meter" }, { status: 500 });
  }
}

// POST → record a reading. PATCH-style config (unit/interval) rides along so a
// machine can be set up and read in one action.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = await request.json();

    const [eq0] = await db.select().from(equipment).where(eq(equipment.id, id)).limit(1);
    if (!eq0) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const check = validateReading(body.reading, eq0.currentMeter, !!body.isReset);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const readingDate = String(body.readingDate ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (readingDate > new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ error: "A meter reading cannot be dated in the future." }, { status: 400 });
    }

    await db.insert(meterReadings).values({
      id: nanoid(),
      equipmentId: id,
      reading: check.reading,
      readingDate,
      isReset: !!body.isReset,
      notes: body.notes || null,
      recordedById: gate.actor?.id ?? null,
      recordedByName: gate.actor?.name ?? null,
    });

    const updates: Record<string, unknown> = {
      currentMeter: check.reading,
      meterUpdatedAt: new Date().toISOString(),
    };
    if (isMeterUnit(body.meterUnit)) updates.meterUnit = String(body.meterUnit).toUpperCase();
    if (body.meterServiceInterval !== undefined) {
      const n = Number(body.meterServiceInterval);
      updates.meterServiceInterval = Number.isFinite(n) && n > 0 ? n : null;
    }
    // A meter swap restarts the count from the new meter's zero, otherwise the
    // machine would appear to owe every hour the old meter ever recorded.
    if (body.isReset) updates.meterAtLastService = check.reading;
    if (body.serviceDone) updates.meterAtLastService = check.reading;

    await db.update(equipment).set(updates).where(eq(equipment.id, id));

    const unit = (updates.meterUnit as string) ?? eq0.meterUnit ?? "";
    await logEquipmentEvent({
      equipmentId: id,
      category: "METER",
      source: "AUTO",
      title: body.isReset
        ? `Meter replaced — restarted at ${check.reading} ${unit}`
        : `Meter read: ${check.reading} ${unit}`,
      detail: body.notes || null,
      occurredAt: readingDate,
      performedById: gate.actor?.id ?? null,
      performedByName: gate.actor?.name ?? null,
    });

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "UPDATE",
      entityType: "equipment",
      entityId: id,
      entityDescription: `${eq0.assetId} meter reading ${check.reading} ${unit}${body.serviceDone ? " (service performed)" : ""}`,
    });

    const state = meterState(
      check.reading,
      (updates.meterAtLastService as number) ?? eq0.meterAtLastService,
      (updates.meterServiceInterval as number) ?? eq0.meterServiceInterval,
    );
    return NextResponse.json({ ok: true, state }, { status: 201 });
  } catch (error) {
    console.error("Failed to record meter reading:", error);
    return NextResponse.json({ error: "Failed to record meter reading" }, { status: 500 });
  }
}
