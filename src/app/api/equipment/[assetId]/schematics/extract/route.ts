// src/app/api/equipment/[assetId]/schematics/extract/route.ts
// P2-lite component extraction from a schematic's PDF text layer — NO AI, no
// API key (docs/TROUBLESHOOTING-ENGINE.md; deterministic alternative to the
// disabled vision engine). Results persist as a LOCAL_TEXT job in
// schematic_ingestion_jobs with status NEEDS_REVIEW; nothing touches the
// component registry until a human confirms (see ./confirm).
//
//   POST { documentId } → run extraction, store job, return candidates
//   GET  ?documentId=X  → latest LOCAL_TEXT job + candidates for review
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, equipmentDocuments, schematicIngestionJobs } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { extractTags } from "@/lib/diagnostics/extract-tags";
import { loadFileBytes } from "@/lib/diagnostics/schematic-prep";

async function resolveEquipment(assetId: string) {
  const slash = assetId.replace(/-/g, "/");
  const [e] = await db
    .select()
    .from(equipment)
    .where(or(eq(equipment.assetId, slash), eq(equipment.assetId, assetId)))
    .limit(1);
  return e;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const { assetId } = await params;
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    const documentId = new URL(request.url).searchParams.get("documentId") || "";

    const jobs = await db
      .select()
      .from(schematicIngestionJobs)
      .where(
        and(
          eq(schematicIngestionJobs.documentId, documentId),
          eq(schematicIngestionJobs.provider, "LOCAL_TEXT"),
        ),
      );
    const latest = jobs.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))[0] ?? null;
    return NextResponse.json({
      job: latest
        ? { id: latest.id, status: latest.status, data: latest.extractedData ? JSON.parse(latest.extractedData) : null }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch extraction:", error);
    return NextResponse.json({ error: "Failed to fetch extraction", details: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const e = await resolveEquipment(assetId);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const body = await request.json();
    const documentId = String(body.documentId || "");
    const [doc] = await db
      .select()
      .from(equipmentDocuments)
      .where(and(eq(equipmentDocuments.id, documentId), eq(equipmentDocuments.equipmentId, e.id)))
      .limit(1);
    if (!doc) return NextResponse.json({ error: "Document not found for this machine" }, { status: 404 });
    if (!doc.fileKey) return NextResponse.json({ error: "Document has no uploaded file" }, { status: 400 });

    const bytes = await loadFileBytes(doc.fileKey);
    if (!bytes) return NextResponse.json({ error: "File unreadable from storage" }, { status: 500 });

    const extraction = await extractTags(bytes);

    // One active LOCAL_TEXT job per document — replace previous runs.
    await db
      .delete(schematicIngestionJobs)
      .where(
        and(
          eq(schematicIngestionJobs.documentId, documentId),
          eq(schematicIngestionJobs.provider, "LOCAL_TEXT"),
        ),
      );

    const job = {
      id: nanoid(),
      equipmentId: e.id,
      documentId,
      pdfKind: doc.pdfKind ?? "UNKNOWN",
      provider: "LOCAL_TEXT",
      status: extraction.candidates.length > 0 ? "NEEDS_REVIEW" : "FAILED",
      attempts: 1,
      extractedData: JSON.stringify(extraction),
      error:
        extraction.candidates.length > 0
          ? null
          : extraction.scannedPages.length === extraction.pages.length
            ? "No text layer — scanned PDF; use click-to-tag or the future vision pipeline."
            : "No recognizable component tags found in the text layer.",
      requestedById: gate.actor?.id ?? null,
    };
    await db.insert(schematicIngestionJobs).values(job);

    return NextResponse.json({ job: { id: job.id, status: job.status, error: job.error, data: extraction } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Extraction failed:", error);
    return NextResponse.json({ error: "Extraction failed", details: message }, { status: 500 });
  }
}
