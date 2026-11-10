// src/app/api/premob/route.ts
// Crane pre-mobilisation register: every crane with its latest premob, and the
// full record list for history. Recording one writes the machine's history log;
// it does not change the machine's status (see lib/premob-verification.ts).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, premobRecords, auditLog } from "@/lib/db/schema";
import { desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { PREMOB_CATEGORIES, dueState, isPremobEligible, validatePremob } from "@/lib/premob-verification";
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
      .where(inArray(equipment.category, [...PREMOB_CATEGORIES]))
      .orderBy(equipment.assetId);

    let records: (typeof premobRecords.$inferSelect)[] = [];
    let setupRequired = false;
    try {
      records = await db.select().from(premobRecords).orderBy(desc(premobRecords.premobDate));
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
    console.error("Failed to load premob register:", error);
    return NextResponse.json({ error: "Failed to load premob register" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    const problem = validatePremob(body, today());
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const [machine] = await db.select().from(equipment).where(eq(equipment.id, String(body.equipmentId ?? ""))).limit(1);
    if (!machine) return NextResponse.json({ error: "Choose the crane." }, { status: 400 });
    if (!isPremobEligible(machine.category)) {
      return NextResponse.json({ error: `${machine.assetId} is not a crane; premob is recorded for cranes.` }, { status: 400 });
    }

    const record = {
      id: nanoid(),
      equipmentId: machine.id,
      premobDate: String(body.premobDate).slice(0, 10),
      vendor: String(body.vendor).trim().slice(0, 200),
      nextDueDate: String(body.nextDueDate).slice(0, 10),
      certificateNumber: String(body.certificateNumber ?? "").trim().slice(0, 100) || null,
      proofFileKey: String(body.proofFileKey),
      proofFileName: String(body.proofFileName ?? "").slice(0, 255) || null,
      proofMimeType: String(body.proofMimeType ?? "").slice(0, 100) || null,
      notes: String(body.notes ?? "").trim().slice(0, 2000) || null,
      recordedById: gate.actor?.id ?? null,
      recordedByName: gate.actor?.name ?? null,
    };

    try {
      await db.insert(premobRecords).values(record);
    } catch (err) {
      if (isMissingTable(err)) return NextResponse.json({ error: SETUP_MESSAGE }, { status: 503 });
      throw err;
    }

    // Best-effort: the record stands even if the history line cannot be written.
    try {
      await logEquipmentEvent({
        equipmentId: machine.id,
        category: "PREMOB",
        title: `Premob by ${record.vendor}, next due ${formatDate(record.nextDueDate)}`,
        detail: [record.certificateNumber && `Certificate ${record.certificateNumber}`, record.notes].filter(Boolean).join(" · ") || null,
        refType: "premob_record",
        refId: record.id,
        href: "/calibration?tab=premob",
        source: "AUTO",
        performedById: record.recordedById,
        performedByName: record.recordedByName,
        occurredAt: `${record.premobDate}T00:00:00.000Z`,
      });
    } catch (err) {
      console.warn("premob: history log failed", err);
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name || "System",
      action: "CREATE",
      entityType: "premob_record",
      entityId: record.id,
      entityDescription: `Premob recorded for ${machine.assetId} (${record.vendor}), next due ${record.nextDueDate}`,
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    console.error("Failed to record premob:", error);
    return NextResponse.json({ error: "Failed to record premob" }, { status: 500 });
  }
}
