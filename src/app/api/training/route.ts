// src/app/api/training/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trainingRecords, competencyMatrix } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { TRAINING_WRITE_ROLES } from "@/lib/roles";

export async function GET() {
  try {
    const competencies = await db.select().from(competencyMatrix);
    const trainings = await db.select().from(trainingRecords);
    trainings.sort((a, b) => (b.plannedDate ?? "").localeCompare(a.plannedDate ?? ""));
    return NextResponse.json({ competencies, trainings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to load training data:", error);
    return NextResponse.json({ error: "Failed to load training data", details: message }, { status: 500 });
  }
}

// Schedule / log a training record.
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(TRAINING_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.trainingTitle || !body.employeeName) {
      return NextResponse.json(
        { error: "trainingTitle and employeeName are required" },
        { status: 400 },
      );
    }

    const record = {
      id: nanoid(),
      userId: body.userId || null,
      employeeName: body.employeeName,
      trainingTitle: body.trainingTitle,
      category: body.category || "TECHNICAL",
      type: body.type || "INTERNAL",
      trainer: body.trainer || null,
      targetGroup: body.targetGroup || "Maintenance Team",
      plannedDate: body.plannedDate || null,
      actualDate: body.actualDate || null,
      duration: body.duration || null,
      certificateIssued: !!body.certificateIssued,
      certificateUrl: body.certificateUrl || null,
      status: body.status || "PLANNED",
    };

    await db.insert(trainingRecords).values(record);
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create training record:", error);
    return NextResponse.json({ error: "Failed to create training record", details: message }, { status: 500 });
  }
}

// Update a training record (mark complete / issue certificate).
export async function PATCH(request: Request) {
  try {
    const gate = await requireRoles(TRAINING_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.actualDate !== undefined) updates.actualDate = body.actualDate;
    if (body.certificateIssued !== undefined) updates.certificateIssued = !!body.certificateIssued;
    if (body.status === "COMPLETED" && !body.actualDate) {
      updates.actualDate = new Date().toISOString().slice(0, 10);
    }

    await db.update(trainingRecords).set(updates).where(eq(trainingRecords.id, body.id));
    const [updated] = await db.select().from(trainingRecords).where(eq(trainingRecords.id, body.id)).limit(1);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to update training record:", error);
    return NextResponse.json({ error: "Failed to update training record", details: message }, { status: 500 });
  }
}
