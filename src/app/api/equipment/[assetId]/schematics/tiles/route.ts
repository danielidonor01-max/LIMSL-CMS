// src/app/api/equipment/[assetId]/schematics/tiles/route.ts
// Viewer data + preparation trigger for schematic tiles (P1 of the
// troubleshooting engine).
//
//   GET  ?documentId=X  → pages with preview + tile metadata (image URLs are
//                         the auth-gated /api/files paths)
//   GET  (no param)     → per-document summaries for this machine
//   POST { documentId } → prepare the next unprepared page (bounded — call
//                         repeatedly until `done`; Vercel-safe)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipment, equipmentDocuments, schematicTiles } from "@/lib/db/schema";
import { and, eq, or } from "drizzle-orm";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { prepareSchematic } from "@/lib/diagnostics/schematic-prep";

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

    const documentId = new URL(request.url).searchParams.get("documentId");

    if (!documentId) {
      // Summaries: which of this machine's documents have prepared tiles.
      const tiles = await db
        .select({ documentId: schematicTiles.documentId, page: schematicTiles.page, level: schematicTiles.level })
        .from(schematicTiles)
        .where(eq(schematicTiles.equipmentId, e.id));
      const byDoc = new Map<string, Set<number>>();
      for (const t of tiles) {
        if (t.level !== 0) continue;
        byDoc.set(t.documentId, (byDoc.get(t.documentId) ?? new Set()).add(t.page));
      }
      return NextResponse.json({
        documents: [...byDoc.entries()].map(([id, pages]) => ({ documentId: id, preparedPages: [...pages].sort((a, b) => a - b) })),
      });
    }

    const rows = await db
      .select()
      .from(schematicTiles)
      .where(and(eq(schematicTiles.documentId, documentId), eq(schematicTiles.equipmentId, e.id)));

    const pages = [...new Set(rows.map((r) => r.page))].sort((a, b) => a - b).map((page) => {
      const pageRows = rows.filter((r) => r.page === page);
      const preview = pageRows.find((r) => r.level === 0);
      return {
        page,
        pageWidth: preview?.pageWidth ?? pageRows[0]?.pageWidth,
        pageHeight: preview?.pageHeight ?? pageRows[0]?.pageHeight,
        dpi: preview?.dpi ?? pageRows[0]?.dpi,
        preview: preview ? { url: `/api/files/${preview.fileKey}` } : null,
        tiles: pageRows
          .filter((r) => r.level === 1)
          .map((r) => ({ tileKey: r.tileKey, x: r.x, y: r.y, w: r.w, h: r.h, url: `/api/files/${r.fileKey}` })),
      };
    });

    return NextResponse.json({ documentId, pages });
  } catch (error) {
    console.error("Failed to fetch schematic tiles:", error);
    return NextResponse.json({ error: "Failed to fetch schematic tiles" }, { status: 500 });
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

    // One page per invocation keeps each call inside serverless time/memory
    // limits; the client loops until done.
    const progress = await prepareSchematic(documentId, 1);
    return NextResponse.json(progress);
  } catch (error) {
    console.error("Schematic preparation failed:", error);
    return NextResponse.json({ error: "Schematic preparation failed" }, { status: 500 });
  }
}
