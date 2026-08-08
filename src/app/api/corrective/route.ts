// src/app/api/corrective/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { correctiveMaintenance, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES, BREAKDOWN_NOTIFY_ROLES } from "@/lib/roles";
import { nextDocNumber } from "@/lib/doc-number";
import { applyDerivedStatus } from "@/lib/equipment-status";
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

    await db.insert(correctiveMaintenance).values(newCorrective);

    // Status is DERIVED from the machine's open work, never flipped here — see
    // lib/equipment-status.ts (the single writer). Best-effort: a derivation
    // failure must not fail the fault report.
    if (body.equipmentId) {
      try {
        await applyDerivedStatus(body.equipmentId);
      } catch (err) {
        console.warn("corrective create: status derivation failed (non-fatal)", err);
      }
    }

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
        roles: BREAKDOWN_NOTIFY_ROLES,
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
