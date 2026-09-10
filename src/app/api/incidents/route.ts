// src/app/api/incidents/route.ts
// Reporting a near miss or a safety incident, and listing them.
//
// The POST gate is deliberately the widest in the system: ANY authenticated
// user may report. A near miss is the cheapest warning available and it is only
// cheap if the person who saw it can file it, which rules out restricting this
// to HSE. Investigating and closing are gated; noticing is not.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { safetyIncidents, equipment, auditLog } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { nextDocNumber } from "@/lib/doc-number";
import { notify } from "@/lib/notifications";
import { INCIDENT_NOTIFY_ROLES } from "@/lib/roles";
import { validateReport, isSerious, INCIDENT_TYPE_LABEL } from "@/lib/hse/incidents";
import { ensureSignoffChain } from "@/lib/signoff/service";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db.select().from(safetyIncidents).orderBy(desc(safetyIncidents.occurredAt));
    const eqList = await db.select().from(equipment);
    const byId = new Map(eqList.map((e) => [e.id, e]));

    return NextResponse.json(
      rows.map((r) => ({
        ...r,
        equipmentName: r.equipmentId ? (byId.get(r.equipmentId)?.name ?? null) : null,
        assetId: r.equipmentId ? (byId.get(r.equipmentId)?.assetId ?? null) : null,
      })),
    );
  } catch (error) {
    console.error("Failed to fetch incidents:", error);
    return NextResponse.json({ error: "Failed to fetch incidents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  const actor = session?.user as { id?: string; name?: string } | undefined;
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    const check = validateReport(body);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const incidentNumber = await nextDocNumber("INC");
    const id = nanoid();
    const now = new Date().toISOString();

    await db.insert(safetyIncidents).values({
      id,
      incidentNumber,
      type: body.type,
      severity: isSerious(body.type) ? "HIGH" : (body.severity ?? "MEDIUM"),
      occurredAt: String(body.occurredAt),
      location: body.location || null,
      equipmentId: body.equipmentId || null,
      permitId: body.permitId || null,
      description: String(body.description).trim(),
      injuredPersonName: body.injuredPersonName || null,
      witnesses: body.witnesses || null,
      // Attribution comes from the session, never from the form. Nobody types
      // somebody else's name onto a safety report.
      reportedById: actor.id ?? null,
      reportedByName: actor.name ?? null,
      reportedAt: now,
      immediateAction: body.immediateAction || null,
      status: "REPORTED",
    });

    // The investigation chain opens with the record, so it is visible in the
    // approvals inbox from the moment it is filed rather than when somebody
    // remembers to start it.
    await ensureSignoffChain("SAFETY_INCIDENT", id, incidentNumber);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: actor.id ?? null,
      userName: actor.name ?? "Unknown",
      action: "CREATE",
      entityType: "safety_incident",
      entityId: id,
      entityDescription: `${incidentNumber} reported: ${INCIDENT_TYPE_LABEL[body.type] ?? body.type}`,
    });

    try {
      await notify({
        event: "GENERAL",
        title: `${incidentNumber} reported, ${INCIDENT_TYPE_LABEL[body.type] ?? body.type}`,
        body:
          `${actor.name ?? "Someone"} reported: ${String(body.description).trim().slice(0, 160)}` +
          (isSerious(body.type) ? " This type requires a documented root cause before it can be closed." : ""),
        linkPath: `/incidents/${id}`,
        relatedEntityType: "safety_incident",
        relatedEntityId: id,
        roles: INCIDENT_NOTIFY_ROLES,
      });
    } catch (err) {
      // A failed notification must never lose the report itself.
      console.warn("incident: notify failed", err);
    }

    return NextResponse.json({ id, incidentNumber }, { status: 201 });
  } catch (error) {
    console.error("Failed to report incident:", error);
    return NextResponse.json({ error: "Failed to report the incident" }, { status: 500 });
  }
}
