// src/app/api/calibration/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { calibrationRecords, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function statusFor(nextDate: string | null): string {
  if (!nextDate) return "CURRENT";
  const days = Math.round((new Date(nextDate).getTime() - Date.now()) / 864e5);
  if (days < 0) return "OVERDUE";
  if (days <= 30) return "DUE_SOON";
  return "CURRENT";
}

export async function GET() {
  try {
    const rows = await db.select().from(calibrationRecords);
    rows.sort((a, b) => (a.nextCalibrationDate ?? "").localeCompare(b.nextCalibrationDate ?? ""));
    return NextResponse.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to load calibration data:", error);
    return NextResponse.json({ error: "Failed to load calibration data", details: message }, { status: 500 });
  }
}

// Record a calibration event. With `id`, rolls the existing instrument's dates
// forward; without `id`, registers a new instrument.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const today = new Date().toISOString().slice(0, 10);
    const lastCalibrationDate = body.lastCalibrationDate || today;
    const interval = body.calibrationInterval ? Number(body.calibrationInterval) : 365;
    const nextCalibrationDate = body.nextCalibrationDate || addDays(lastCalibrationDate, interval);
    const status = statusFor(nextCalibrationDate);

    if (body.id) {
      // Roll an existing instrument forward after a fresh calibration.
      await db
        .update(calibrationRecords)
        .set({
          lastCalibrationDate,
          nextCalibrationDate,
          calibrationInterval: interval,
          calibratedBy: body.calibratedBy || gate.actor?.name || null,
          certificateNumber: body.certificateNumber || null,
          certificateUrl: body.certificateUrl || null,
          status,
        })
        .where(eq(calibrationRecords.id, body.id));

      const [updated] = await db
        .select()
        .from(calibrationRecords)
        .where(eq(calibrationRecords.id, body.id))
        .limit(1);
      return NextResponse.json(updated);
    }

    if (!body.instrumentName) {
      return NextResponse.json({ error: "instrumentName is required" }, { status: 400 });
    }

    const record = {
      id: nanoid(),
      instrumentName: body.instrumentName,
      equipmentId: body.equipmentId || null,
      serialNumber: body.serialNumber || null,
      make: body.make || null,
      model: body.model || null,
      lastCalibrationDate,
      nextCalibrationDate,
      calibrationInterval: interval,
      calibratedBy: body.calibratedBy || gate.actor?.name || null,
      certificateNumber: body.certificateNumber || null,
      certificateUrl: body.certificateUrl || null,
      status,
    };

    await db.insert(calibrationRecords).values(record);

    // Flag the linked equipment as requiring calibration for traceability.
    if (body.equipmentId) {
      await db
        .update(equipment)
        .set({ requiresCalibration: true, updatedAt: new Date().toISOString() })
        .where(eq(equipment.id, body.equipmentId));
    }

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to record calibration:", error);
    return NextResponse.json({ error: "Failed to record calibration", details: message }, { status: 500 });
  }
}
