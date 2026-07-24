// src/app/api/competency/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { competencyMatrix, auditLog } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { TRAINING_WRITE_ROLES } from "@/lib/roles";

// Record / update a competency assessment. If a row for the same person +
// skill area already exists it is updated (re-assessment); otherwise created.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(TRAINING_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.employeeName || !body.skillArea) {
      return NextResponse.json(
        { error: "employeeName and skillArea are required" },
        { status: 400 },
      );
    }

    const level = Number(body.level ?? 0);
    if (!Number.isFinite(level) || level < 0 || level > 5) {
      return NextResponse.json({ error: "Competency level must be a number between 0 and 5." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    // Look for an existing assessment for this person + skill.
    const existing = await db
      .select()
      .from(competencyMatrix)
      .where(
        and(
          eq(competencyMatrix.employeeName, body.employeeName),
          eq(competencyMatrix.skillArea, body.skillArea),
        ),
      )
      .limit(1);

    if (existing.length) {
      await db
        .update(competencyMatrix)
        .set({
          level,
          requiredLevel: body.requiredLevel ?? existing[0].requiredLevel,
          category: body.category ?? existing[0].category,
          role: body.role ?? existing[0].role,
          assessedBy: body.assessedBy || gate.actor?.name || existing[0].assessedBy,
          assessedDate: body.assessedDate || today,
          expiryDate: body.expiryDate ?? existing[0].expiryDate,
          notes: body.notes ?? existing[0].notes,
          updatedAt: now,
        })
        .where(eq(competencyMatrix.id, existing[0].id));
      const [updated] = await db
        .select()
        .from(competencyMatrix)
        .where(eq(competencyMatrix.id, existing[0].id))
        .limit(1);
      await db.insert(auditLog).values({
        id: nanoid(),
        userId: gate.actor?.id ?? null,
        userName: gate.actor?.name ?? "User",
        action: "UPDATE",
        entityType: "competency",
        entityId: existing[0].id,
        entityDescription: `Competency re-assessed — ${body.employeeName} · ${body.skillArea} → level ${level}`,
      });
      return NextResponse.json(updated);
    }

    const row = {
      id: nanoid(),
      userId: body.userId || null,
      employeeName: body.employeeName,
      role: body.role || null,
      skillArea: body.skillArea,
      category: body.category || "TECHNICAL",
      level,
      requiredLevel: body.requiredLevel ?? 2,
      assessedBy: body.assessedBy || gate.actor?.name || null,
      assessedDate: body.assessedDate || today,
      expiryDate: body.expiryDate || null,
      notes: body.notes || null,
    };
    await db.insert(competencyMatrix).values(row);
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "User",
      action: "CREATE",
      entityType: "competency",
      entityId: row.id,
      entityDescription: `Competency recorded — ${row.employeeName} · ${row.skillArea} level ${level}`,
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to record competency:", error);
    return NextResponse.json({ error: "Failed to record competency", details: message }, { status: 500 });
  }
}
