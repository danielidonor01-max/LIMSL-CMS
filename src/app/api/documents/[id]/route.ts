// src/app/api/documents/[id]/route.ts
// Deleting a machine's document.
//
// What was deleted, by whom and why is written to the audit log in full (type,
// title, file name, size, who uploaded it), because the file itself is gone
// once this returns. What exists only because of the document goes with it:
// its text in the troubleshooting index and its schematic tiles. Records that
// merely pointed at it (an ingestion job, a component's schematic link) keep
// their history and lose the link.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  equipmentDocuments,
  equipment,
  documentChunks,
  schematicTiles,
  schematicIngestionJobs,
  componentRegistry,
  auditLog,
} from "@/lib/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { DOCUMENT_DELETE_ROLES, MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { deleteFile } from "@/lib/storage";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { reason?: unknown };
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const [doc] = await db.select().from(equipmentDocuments).where(eq(equipmentDocuments.id, id)).limit(1);
    if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const ownUpload = !!doc.uploadedBy && doc.uploadedBy === gate.actor?.name;
    if (!DOCUMENT_DELETE_ROLES.includes(gate.actor?.role ?? "") && !ownUpload) {
      return NextResponse.json(
        { error: "Only a Foreman or above, or the person who uploaded it, can delete a document." },
        { status: 403 },
      );
    }

    const [machine] = await db
      .select({ assetId: equipment.assetId, name: equipment.name })
      .from(equipment)
      .where(eq(equipment.id, doc.equipmentId))
      .limit(1);

    await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
    await db.delete(schematicTiles).where(eq(schematicTiles.documentId, id));
    await db.update(schematicIngestionJobs).set({ documentId: null }).where(eq(schematicIngestionJobs.documentId, id));
    await db.update(componentRegistry).set({ schematicDocId: null }).where(eq(componentRegistry.schematicDocId, id));
    await db.delete(equipmentDocuments).where(eq(equipmentDocuments.id, id));

    // The stored file goes too, unless another document record uses the same
    // file. Best-effort: a file left behind costs storage, a record left
    // pointing at nothing would cost a broken link.
    let fileRemoved = false;
    if (doc.fileKey) {
      const [shared] = await db
        .select({ id: equipmentDocuments.id })
        .from(equipmentDocuments)
        .where(and(eq(equipmentDocuments.fileKey, doc.fileKey), ne(equipmentDocuments.id, id)))
        .limit(1);
      if (!shared) {
        try {
          await deleteFile(doc.fileKey);
          fileRemoved = true;
        } catch (err) {
          console.warn("documents: stored file could not be removed (non-fatal)", err);
        }
      }
    }

    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? null,
      action: "DELETE",
      entityType: "equipment_document",
      entityId: id,
      entityDescription:
        `${doc.title} deleted from ${machine?.assetId ?? "a machine"}${machine?.name ? ` ${machine.name}` : ""}` +
        (reason ? `. Reason: ${reason}` : ""),
      changes: JSON.stringify({
        deleted: {
          equipmentId: doc.equipmentId,
          docType: doc.docType,
          title: doc.title,
          revision: doc.revision,
          fileName: doc.fileName,
          fileKey: doc.fileKey,
          mimeType: doc.mimeType,
          fileSize: doc.fileSize,
          expiryDate: doc.expiryDate,
          uploadedBy: doc.uploadedBy,
          uploadedAt: doc.createdAt,
        },
        reason: reason || null,
        fileRemoved,
      }),
    });

    return NextResponse.json({ ok: true, fileRemoved });
  } catch (error) {
    console.error("Failed to delete document:", error);
    return NextResponse.json({ error: "Failed to delete the document." }, { status: 500 });
  }
}
