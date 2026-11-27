// src/app/api/corrective/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { correctiveMaintenance, equipment } from "@/lib/db/schema";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES, WORK_ASSIGN_ROLES } from "@/lib/roles";
import { reportBreakdown } from "@/lib/maintenance/report-breakdown";

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

    // Corrective work arrives two ways. A breakdown is REPORTED by whoever
    // found it — anyone who can write maintenance records. A repair a foreman
    // has PLANNED is SCHEDULED, and planning somebody else's week is the same
    // supervisory act as assigning it, so it sits behind the same gate.
    const scheduled = String(body.origin ?? "REPORTED").toUpperCase() === "SCHEDULED";
    if (scheduled && !WORK_ASSIGN_ROLES.includes(gate.actor?.role ?? "")) {
      return NextResponse.json(
        { error: "Scheduling corrective work is done by a foreman or above. Report the fault instead." },
        { status: 403 },
      );
    }

    // When the fault happened, as the reporter's local "YYYY-MM-DDTHH:MM".
    // A breakdown is often written up hours or days later, and downtime and
    // MTTR are only true when they run from the fault, not from the paperwork.
    const occurred = typeof body.faultOccurredAt === "string" ? body.faultOccurredAt.trim() : "";
    if (occurred) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(occurred) || isNaN(Date.parse(`${occurred}:00`))) {
        return NextResponse.json({ error: "The fault date and time could not be read." }, { status: 400 });
      }
      // A few hours of slack for clock differences between devices.
      if (Date.parse(`${occurred}:00Z`) > Date.now() + 14 * 3_600_000) {
        return NextResponse.json({ error: "The fault cannot have happened in the future." }, { status: 400 });
      }
    }

    const newCorrective = await reportBreakdown(
      {
        equipmentId: body.equipmentId,
        faultDescription: body.faultDescription,
        urgency: body.urgency,
        faultType: body.faultType,
        downStartAt: occurred || null,
        reportedDate: body.reportedDate,
        scheduled,
        plannedDate: body.plannedDate,
        breakdownId: body.breakdownId,
        operatingStatusAtFailure: body.operatingStatusAtFailure,
        observedFault: body.observedFault,
        errorCodes: body.errorCodes,
        environmentalCondition: body.environmentalCondition,
      },
      gate.actor ?? {},
    );

    return NextResponse.json(newCorrective, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create corrective record:", error);
    return NextResponse.json({ error: "Failed to create corrective record" }, { status: 500 });
  }
}
