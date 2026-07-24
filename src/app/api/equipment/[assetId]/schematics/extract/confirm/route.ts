// src/app/api/equipment/[assetId]/schematics/extract/confirm/route.ts
// Human confirmation of a LOCAL_TEXT extraction (P2-lite). The reviewed
// component list upserts into component_registry — keyed by tag per machine so
// re-confirming updates rather than duplicates — and the job flips CONFIRMED.
// This is the only path from extraction into live data.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { componentRegistry, equipment, schematicIngestionJobs } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { zoneReference, type PageSize } from "@/lib/diagnostics/extract-tags";

type ConfirmComponent = {
  tag: string;
  name: string;
  type: string;
  page: number;
  bbox: { x: number; y: number; w: number; h: number };
};

const VALID_TYPES = new Set(["ELECTRICAL", "HYDRAULIC", "PNEUMATIC", "CONTROL", "MECHANICAL"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { assetId } = await params;
    const slash = assetId.replace(/-/g, "/");
    const [e] = await db
      .select()
      .from(equipment)
      .where(or(eq(equipment.assetId, slash), eq(equipment.assetId, assetId)))
      .limit(1);
    if (!e) return NextResponse.json({ error: "Equipment not found" }, { status: 404 });

    const body = await request.json();
    const jobId = String(body.jobId || "");
    const components: ConfirmComponent[] = Array.isArray(body.components) ? body.components : [];

    const [job] = await db
      .select()
      .from(schematicIngestionJobs)
      .where(and(eq(schematicIngestionJobs.id, jobId), eq(schematicIngestionJobs.equipmentId, e.id)))
      .limit(1);
    if (!job) return NextResponse.json({ error: "Extraction job not found" }, { status: 404 });
    if (!components.length) return NextResponse.json({ error: "No components selected" }, { status: 400 });

    const pages: PageSize[] = job.extractedData ? (JSON.parse(job.extractedData).pages ?? []) : [];
    const existing = await db
      .select()
      .from(componentRegistry)
      .where(eq(componentRegistry.equipmentId, e.id));
    const byTag = new Map(existing.map((c) => [c.componentTag.toUpperCase(), c]));

    let created = 0;
    let updated = 0;
    for (const c of components) {
      const tag = String(c.tag || "").trim();
      if (!tag) continue;
      const size = pages.find((p) => p.page === c.page);
      const fields = {
        name: String(c.name || "Component").slice(0, 120),
        type: VALID_TYPES.has(c.type) ? c.type : "ELECTRICAL",
        schematicReference: size ? zoneReference(c.page, c.bbox, size) : `Sheet ${c.page}`,
        schematicDocId: job.documentId,
        schematicPage: c.page,
        bboxX: c.bbox?.x ?? null,
        bboxY: c.bbox?.y ?? null,
        bboxW: c.bbox?.w ?? null,
        bboxH: c.bbox?.h ?? null,
      };
      const prior = byTag.get(tag.toUpperCase());
      if (prior) {
        await db.update(componentRegistry).set(fields).where(eq(componentRegistry.id, prior.id));
        updated++;
      } else {
        await db.insert(componentRegistry).values({
          id: nanoid(),
          equipmentId: e.id,
          componentTag: tag,
          status: "OPERATIONAL",
          ...fields,
        });
        created++;
      }
    }

    await db
      .update(schematicIngestionJobs)
      .set({ status: "CONFIRMED", reviewedById: gate.actor?.id ?? null, updatedAt: new Date().toISOString() })
      .where(eq(schematicIngestionJobs.id, jobId));

    return NextResponse.json({ confirmed: created + updated, created, updated });
  } catch (error) {
    console.error("Confirm failed:", error);
    return NextResponse.json({ error: "Confirm failed" }, { status: 500 });
  }
}
