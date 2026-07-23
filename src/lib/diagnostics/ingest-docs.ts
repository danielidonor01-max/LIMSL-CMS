// src/lib/diagnostics/ingest-docs.ts
// P0 document ingestion (docs/TROUBLESHOOTING-ENGINE.md §2.2): turn uploaded
// text documents and the approved maintenance procedure into searchable
// document_chunks rows. Idempotent — each run replaces the source's previous
// chunks, so re-ingesting after an upload or a new procedure revision is safe.
// Pure code, no AI: this path works with the schematic engine still disabled.
import { db } from "@/lib/db";
import { documentChunks, equipmentDocuments, procedureRevisions } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { serveFile } from "@/lib/storage";
import { chunkPages, type Chunk } from "./chunker";
import { extractText, isExtractableMime } from "./extract-text";

export type IngestSummary = {
  source: string;
  status: "INGESTED" | "SKIPPED";
  reason?: string;
  chunks: number;
  pdfKind?: string;
};

// Load an uploaded file's bytes regardless of storage backend (LOCAL streams
// bytes; SUPABASE returns a short-lived signed URL we fetch server-side).
async function loadFileBytes(fileKey: string): Promise<Uint8Array | null> {
  const served = await serveFile(fileKey);
  if (served.kind === "stream") return served.body;
  if (served.kind === "redirect") {
    const res = await fetch(served.url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }
  return null;
}

async function replaceChunks(
  where: { documentId?: string; procedure?: boolean },
  rows: Chunk[],
  meta: { equipmentId: string | null; documentId: string | null; sourceType: string; sourceLabel: string },
): Promise<void> {
  if (where.documentId) {
    await db.delete(documentChunks).where(eq(documentChunks.documentId, where.documentId));
  } else if (where.procedure) {
    await db
      .delete(documentChunks)
      .where(and(eq(documentChunks.sourceType, "PROCEDURE"), isNull(documentChunks.documentId)));
  }
  if (!rows.length) return;
  await db.insert(documentChunks).values(
    rows.map((c) => ({
      id: nanoid(),
      equipmentId: meta.equipmentId,
      documentId: meta.documentId,
      sourceType: meta.sourceType,
      sourceLabel: meta.sourceLabel,
      chunkIndex: c.chunkIndex,
      heading: c.heading,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      content: c.content,
      tokenEstimate: c.tokenEstimate,
    })),
  );
}

// Ingest one uploaded equipment document. Skips (never throws) when the file
// is absent or not text-extractable; sets pdfKind on the document either way.
export async function ingestDocument(documentId: string): Promise<IngestSummary> {
  const [doc] = await db
    .select()
    .from(equipmentDocuments)
    .where(eq(equipmentDocuments.id, documentId))
    .limit(1);
  if (!doc) return { source: documentId, status: "SKIPPED", reason: "document not found", chunks: 0 };

  const label = `${doc.title}${doc.revision ? ` (Rev ${doc.revision})` : ""}`;
  if (!doc.fileKey) return { source: label, status: "SKIPPED", reason: "no uploaded file", chunks: 0 };
  if (!isExtractableMime(doc.mimeType, doc.fileName)) {
    return { source: label, status: "SKIPPED", reason: `not text-extractable (${doc.mimeType ?? "unknown"})`, chunks: 0 };
  }

  const bytes = await loadFileBytes(doc.fileKey);
  if (!bytes) return { source: label, status: "SKIPPED", reason: "file unreadable from storage", chunks: 0 };

  const { pages, pdfKind } = await extractText(bytes, doc.mimeType, doc.fileName);

  if (pdfKind !== "UNKNOWN" && pdfKind !== doc.pdfKind) {
    await db
      .update(equipmentDocuments)
      .set({ pdfKind, updatedAt: new Date().toISOString() })
      .where(eq(equipmentDocuments.id, doc.id));
  }

  if (!pages.length || pdfKind === "IMAGE_ONLY") {
    await replaceChunks({ documentId: doc.id }, [], { equipmentId: doc.equipmentId, documentId: doc.id, sourceType: "DOCUMENT", sourceLabel: label });
    return {
      source: label,
      status: "SKIPPED",
      reason: pdfKind === "IMAGE_ONLY" ? "scanned PDF (image-only) — needs the vision pipeline" : "no text found",
      chunks: 0,
      pdfKind,
    };
  }

  const chunks = chunkPages(pages);
  await replaceChunks({ documentId: doc.id }, chunks, {
    equipmentId: doc.equipmentId,
    documentId: doc.id,
    sourceType: "DOCUMENT",
    sourceLabel: label,
  });
  return { source: label, status: "INGESTED", chunks: chunks.length, pdfKind };
}

// Ingest the current APPROVED maintenance procedure revision (markdown in the
// DB — no file involved). Plant-wide: equipmentId stays NULL so passages
// surface for every machine.
export async function ingestApprovedProcedure(): Promise<IngestSummary> {
  const revs = await db
    .select()
    .from(procedureRevisions)
    .where(eq(procedureRevisions.status, "APPROVED"));
  const current = revs.sort((a, b) => b.revision - a.revision)[0];
  if (!current) {
    return { source: "maintenance procedure", status: "SKIPPED", reason: "no APPROVED revision", chunks: 0 };
  }

  const label = `Maintenance Procedure Rev ${current.revision}`;
  const chunks = chunkPages([{ page: 1, text: current.contentMarkdown }]);
  await replaceChunks({ procedure: true }, chunks, {
    equipmentId: null,
    documentId: null,
    sourceType: "PROCEDURE",
    sourceLabel: label,
  });
  return { source: label, status: "INGESTED", chunks: chunks.length };
}
