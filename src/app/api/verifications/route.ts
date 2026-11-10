// src/app/api/verifications/route.ts
// In-house verification register for welding machines and cranes. A machine's
// readings are checked against a calibrated reference instrument; the route
// refuses a reference that was not in calibration on the day. Recording one
// writes the machine's history log and leaves its status alone.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, equipmentVerifications, calibrationRecords, auditLog } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import {
  VERIFICATION_CATEGORIES,
  cleanReadings,
  dueState,
  isVerificationEligible,
  referenceError,
  validateVerification,
} from "@/lib/premob-verification";
import { logEquipmentEvent } from "@/lib/equipment-log";
import { isMissingTable, SETUP_MESSAGE } from "@/lib/db/missing-table";
import { formatDate } from "@/lib/utils";

const today = () => new Date().toISOString().slice(0, 10);

export async function GET() {
  try {
    const machines = await db
      .select({
        id: equipment.id,
        assetId: equipment.assetId,
        name: equipment.name,
        location: equipment.location,
        category: equipment.category,
      })
      .from(equipment)
      .where(inArray(equipment.category, [...VERIFICATION_CATEGORIES]))
      .orderBy(equipment.category, equipment.assetId);

    let records: (typeof equipmentVerifications.$inferSelect)[] = [];
    let setupRequired = false;
    try {
      records = await db.select().from(equipmentVerifications).orderBy(desc(equipmentVerifications.verificationDate));
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      setupRequired = true;
    }

    const t = today();
    const rows = machines.map((m) => {
      const latest = records.find((r) => r.equipmentId === m.id) ?? null;
      return { ...m, latest, state: dueState(latest?.nextDueDate, t) };
    });
    return NextResponse.json({ machines: rows, records, setupRequired });
  } catch (error) {
    console.error("Failed to load verification register:", error);
    return NextResponse.json({ error: "Failed to load verification register" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const problem = validateVerification(body, today());
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const date = String(body.verificationDate).slice(0, 10);

    const [machine] = await db.select().from(equipment).where(eq(equipment.id, String(body.equipmentId ?? ""))).limit(1);
    if (!machine) return NextResponse.json({ error: "Choose the machine." }, { status: 400 });
    if (!isVerificationEligible(machine.category)) {
      return NextResponse.json(
        { error: `${machine.assetId} is not a welding machine or crane; verification is recorded for those.` },
        { status: 400 },
      );
    }

    const [ref] = await db
      .select()
      .from(calibrationRecords)
      .where(eq(calibrationRecords.id, String(body.referenceInstrumentId ?? "")))
      .limit(1);
    const refProblem = referenceError(ref ?? null, date);
    if (refProblem) return NextResponse.json({ error: refProblem }, { status: 400 });

    const readings = cleanReadings(body.readings);
    const result = body.result as "PASS" | "FAIL";
    const record = {
      id: nanoid(),
      equipmentId: machine.id,
      verificationDate: date,
      referenceInstrumentId: ref!.id,
      referenceSnapshot: [
        ref!.instrumentName,
        ref!.serialNumber && `S/N ${ref!.serialNumber}`,
        ref!.certificateNumber && `cert ${ref!.certificateNumber}`,
        ref!.nextCalibrationDate && `cal due ${ref!.nextCalibrationDate}`,
      ]
        .filter(Boolean)
        .join(" · "),
      readings: JSON.stringify(readings),
      result,
      nextDueDate: String(body.nextDueDate ?? "").slice(0, 10) || null,
      proofFileKey: String(body.proofFileKey ?? "").trim() || null,
      proofFileName: String(body.proofFileName ?? "").slice(0, 255) || null,
      notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
      verifiedById: gate.actor?.id ?? null,
      verifiedByName: gate.actor?.name ?? null,
    };

    try {
      await db.insert(equipmentVerifications).values(record);
    } catch (err) {
      if (isMissingTable(err)) return NextResponse.json({ error: SETUP_MESSAGE }, { status: 503 });
      throw err;
    }

    try {
      await logEquipmentEvent({
        equipmentId: machine.id,
        category: "VERIFICATION",
        title: `In-house verification ${result === "PASS" ? "passed" : "FAILED"} against ${ref!.instrumentName}`,
        detail:
          [
            readings.map((r) => `${r.parameter}: ${r.machine || "-"} vs ${r.reference || "-"}${r.tolerance ? ` (${r.tolerance})` : ""}`).join("; "),
            record.nextDueDate && `Next due ${formatDate(record.nextDueDate)}`,
            record.notes,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        refType: "equipment_verification",
        refId: record.id,
        href: "/calibration?tab=verification",
        source: "AUTO",
        performedById: record.verifiedById,
        performedByName: record.verifiedByName,
        occurredAt: `${date}T00:00:00.000Z`,
      });
    } catch (err) {
      console.warn("verification: history log failed", err);
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "equipment_verification",
      entityId: record.id,
      entityDescription: `Verification ${result} for ${machine.assetId} against ${ref!.instrumentName}`,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Failed to record verification:", error);
    return NextResponse.json({ error: "Failed to record verification" }, { status: 500 });
  }
}
