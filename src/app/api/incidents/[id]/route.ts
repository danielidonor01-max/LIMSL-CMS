// src/app/api/incidents/[id]/route.ts
// Reading one incident, and recording the investigation against it.
//
// Reporting is open to everyone; investigating is not. The person who saw the
// event is rarely the person who should be attributing its root cause, and on a
// record that can end up in front of a regulator that separation is the point.
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { safetyIncidents, equipment, auditLog } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { INCIDENT_INVESTIGATE_ROLES } from "@/lib/roles";
import { blockersToClose } from "@/lib/hse/incidents";
import { getSignoffChain } from "@/lib/signoff/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const [row] = await db.select().from(safetyIncidents).where(eq(safetyIncidents.id, id)).limit(1);
    if (!row) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

    const eqRow = row.equipmentId
      ? (await db.select().from(equipment).where(eq(equipment.id, row.equipmentId)).limit(1))[0]
      : null;

    return NextResponse.json({
      ...row,
      equipmentName: eqRow?.name ?? null,
      assetId: eqRow?.assetId ?? null,
      investigation: await getSignoffChain("SAFETY_INCIDENT", row.id),
      blockers: blockersToClose(row),
    });
  } catch (error) {
    console.error("Failed to fetch incident:", error);
    return NextResponse.json({ error: "Failed to fetch the incident" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireRoles(INCIDENT_INVESTIGATE_ROLES);
  if (gate.res) return gate.res;

  const { id } = await params;
  try {
    const [record] = await db.select().from(safetyIncidents).where(eq(safetyIncidents.id, id)).limit(1);
    if (!record) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

    const body = await request.json();
    const next = {
      immediateAction: body.immediateAction ?? record.immediateAction,
      rootCause: body.rootCause ?? record.rootCause,
      correctiveAction: body.correctiveAction ?? record.correctiveAction,
      investigatorId: body.investigatorId ?? record.investigatorId,
      investigatorName: body.investigatorName ?? record.investigatorName,
      targetDate: body.targetDate ?? record.targetDate,
      severity: body.severity ?? record.severity,
      status: body.status ?? record.status,
    };

    // Closing is refused with the reasons rather than a bare no, because the
    // person closing it is the person who has to fix whatever is missing.
    if (next.status === "CLOSED" && record.status !== "CLOSED") {
      const blockers = blockersToClose({ ...record, ...next });
      if (blockers.length) {
        return NextResponse.json(
          { error: "This incident cannot be closed yet.", blockers },
          { status: 409 },
        );
      }
    }

    await db
      .update(safetyIncidents)
      .set({
        ...next,
        closedAt: next.status === "CLOSED" ? (record.closedAt ?? new Date().toISOString()) : record.closedAt,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(safetyIncidents.id, id));

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "Unknown",
      action: "UPDATE",
      entityType: "safety_incident",
      entityId: id,
      entityDescription:
        next.status !== record.status
          ? `${record.incidentNumber} moved to ${String(next.status).toLowerCase().replace(/_/g, " ")}`
          : `${record.incidentNumber} investigation updated`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update incident:", error);
    return NextResponse.json({ error: "Failed to update the incident" }, { status: 500 });
  }
}
