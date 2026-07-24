// src/app/api/corrective/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { correctiveMaintenance, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { notify } from "@/lib/notifications";

export async function GET() {
  try {
    const list = await db.select().from(correctiveMaintenance);
    const eqList = await db.select().from(equipment);
    const byId = new Map(eqList.map((e) => [e.id, e]));
    const enriched = list.map((r) => {
      const e = byId.get(r.equipmentId);
      return { ...r, equipmentName: e?.name ?? null, assetId: e?.assetId ?? null };
    });
    return NextResponse.json(enriched);
  } catch (error: any) {
    console.error("Failed to fetch corrective list:", error);
    return NextResponse.json({ error: "Failed to fetch corrective list" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();

    const cmrfNumber = await nextDocNumber("CMRF");

    const newCorrective = {
      id: nanoid(),
      cmrfNumber,
      breakdownId: body.breakdownId || `BD-${nanoid(6).toUpperCase()}`,
      equipmentId: body.equipmentId,
      reportedById: gate.actor?.id ?? null,
      reportedByName: gate.actor?.name || "Unknown",
      reportedDate: body.reportedDate || new Date().toISOString().split("T")[0],
      faultType: body.faultType || "UNKNOWN",
      urgency: body.urgency || "MEDIUM",
      faultDescription: body.faultDescription || "",
      operatingStatusAtFailure: body.operatingStatusAtFailure || "RUNNING",
      observedFault: body.observedFault || "",
      errorCodes: body.errorCodes || "",
      environmentalCondition: body.environmentalCondition || "",
      status: "OPEN",
    };

    // The fault record and the machine's status flip are one atomic unit — a
    // machine must never sit flagged BROKEN_DOWN with no corrective record
    // backing it (the record inserts FIRST inside the transaction).
    await db.transaction(async (tx) => {
      await tx.insert(correctiveMaintenance).values(newCorrective);
      if (body.equipmentId) {
        await tx
          .update(equipment)
          .set({
            status: body.urgency === "CRITICAL" || body.urgency === "HIGH" ? "BROKEN_DOWN" : "UNDER_MAINTENANCE",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(equipment.id, body.equipmentId));
      }
    });

    // Alert the maintenance leadership + HSE that a breakdown was logged.
    // Best-effort — never let a notification failure fail the record.
    try {
      const [eqRow] = await db.select().from(equipment).where(eq(equipment.id, body.equipmentId)).limit(1);
      const machine = eqRow ? `${eqRow.assetId} — ${eqRow.name}` : "a machine";
      await notify({
        event: "BREAKDOWN",
        title: `Breakdown logged: ${machine}`,
        body: `${newCorrective.cmrfNumber} (${newCorrective.urgency}) — ${newCorrective.faultDescription || "fault reported"}. Reported by ${newCorrective.reportedByName}.`,
        linkPath: `/corrective/${newCorrective.id}`,
        relatedEntityType: "corrective_maintenance",
        relatedEntityId: newCorrective.id,
        roles: ["MAINTENANCE_MANAGER", "FOREMAN", "HSE"],
      });
    } catch (err) {
      console.warn("corrective: breakdown notify failed", err);
    }

    return NextResponse.json(newCorrective, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create corrective record:", error);
    return NextResponse.json({ error: "Failed to create corrective record" }, { status: 500 });
  }
}
