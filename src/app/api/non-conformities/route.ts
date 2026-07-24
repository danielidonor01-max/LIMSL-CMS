// src/app/api/non-conformities/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { nonConformities, auditLog } from "@/lib/db/schema";
import { count } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { COMPLIANCE_WRITE_ROLES } from "@/lib/roles";

export async function GET() {
  try {
    const list = await db.select().from(nonConformities);
    return NextResponse.json(list);
  } catch (error: any) {
    console.error("Failed to fetch non-conformities:", error);
    return NextResponse.json({ error: "Failed to fetch non-conformities", details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(COMPLIANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!String(body.description ?? "").trim()) {
      return NextResponse.json({ error: "A description of the non-conformity is required." }, { status: 400 });
    }

    const countResult = await db.select({ value: count() }).from(nonConformities);
    const totalCount = countResult[0]?.value || 0;
    const ncNumber = `NC-2026-${(totalCount + 1).toString().padStart(4, "0")}`;

    const newNc = {
      id: nanoid(),
      ncNumber,
      type: body.type || "AUDIT_FINDING",
      severity: body.severity || "MEDIUM",
      detectedDate: new Date().toISOString().split("T")[0],
      // The detector defaults to the authenticated raiser. body.detectedBy stays
      // accepted for the auto-detect scan ("System Audit") and for a QA officer
      // recording a detection reported by someone else — but the audit-log row
      // below always pins WHO actually raised the record.
      detectedBy: body.detectedBy || gate.actor?.name || "System Audit",
      relatedEntityType: body.relatedEntityType || null,
      relatedEntityId: body.relatedEntityId || null,
      equipmentId: body.equipmentId || null,
      description: body.description,
      rootCause: body.rootCause || "",
      correctiveAction: body.correctiveAction || "",
      responsiblePersonId: body.responsiblePersonId || null,
      targetDate: body.targetDate || null,
      status: "OPEN",
      autoDetected: body.autoDetected || false,
    };

    await db.insert(nonConformities).values(newNc);

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: "CREATE",
      entityType: "non_conformity",
      entityId: newNc.id,
      entityDescription: `NC ${ncNumber} raised (${newNc.severity}) — ${String(newNc.description).slice(0, 80)}`,
    });

    return NextResponse.json(newNc, { status: 201 });
  } catch (error: any) {
    console.error("Failed to create non-conformity:", error);
    return NextResponse.json({ error: "Failed to create non-conformity", details: error.message }, { status: 500 });
  }
}
