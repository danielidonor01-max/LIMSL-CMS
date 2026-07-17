// src/app/api/equipment/[assetId]/schematics/ingest/route.ts
// Enqueue schematic PDFs for AI ingestion. The engine is scaffolded but OFF
// until configured — jobs are created in PENDING and processed later.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, equipmentDocuments, schematicIngestionJobs } from "@/lib/db/schema";
import { eq, or, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { ingestionReady, config } from "@/lib/config";
import { processPendingJobs } from "@/lib/diagnostics/ingestion/worker";

async function resolveEquipment(assetId: string) {
  const slash = assetId.replace(/-/g, "/");
  const [e] = await db
    .select()
    .from(equipment)
    .where(or(eq(equipment.assetId, slash), eq(equipment.assetId, assetId)))
    .limit(1);
  return e;
}

// GET → engine status + existing jobs for this machine
export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  const e = await resolveEquipment(assetId);
  if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
  const jobs = await db.select().from(schematicIngestionJobs).where(eq(schematicIngestionJobs.equipmentId, e.id));
  return NextResponse.json({ engine: ingestionReady(), provider: config.ingestionProvider, jobs });
}

// POST → enqueue ingestion jobs for this machine's schematic documents
export async function POST(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;
    const user = { id: gate.actor?.id };
    const { assetId } = await params;
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const docs = (
      await db.select().from(equipmentDocuments).where(eq(equipmentDocuments.equipmentId, e.id))
    ).filter((d) => d.docType === "ELECTRICAL_SCHEMATIC" && d.status === "AVAILABLE");

    let created = 0;
    for (const d of docs) {
      const [existing] = await db
        .select({ id: schematicIngestionJobs.id })
        .from(schematicIngestionJobs)
        .where(and(eq(schematicIngestionJobs.documentId, d.id), eq(schematicIngestionJobs.equipmentId, e.id)))
        .limit(1);
      if (existing) continue;
      await db.insert(schematicIngestionJobs).values({
        id: nanoid(),
        equipmentId: e.id,
        documentId: d.id,
        fileUrl: d.fileUrl,
        pdfKind: d.pdfKind ?? "UNKNOWN",
        provider: config.ingestionProvider,
        status: "PENDING",
        requestedById: user?.id ?? null,
      });
      created++;
    }

    const ready = ingestionReady();
    // If configured, kick a processing pass now; otherwise leave jobs pending.
    const result = ready.ready ? await processPendingJobs() : { processed: 0, skipped: true, reason: ready.reason };

    return NextResponse.json({
      enqueued: created,
      schematicsFound: docs.length,
      engine: ready,
      processing: result,
      message: ready.ready
        ? `Enqueued ${created} schematic(s) for ingestion.`
        : `Engine disabled — ${created} schematic(s) queued for future processing (${ready.reason}).`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Ingest enqueue failed:", error);
    return NextResponse.json({ error: "Ingest enqueue failed", details: message }, { status: 500 });
  }
}
