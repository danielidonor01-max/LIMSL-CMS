// src/app/api/documents/route.ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { equipmentDocuments, equipment } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";

// GET /api/documents            → all documents (joined with equipment)
// GET /api/documents?assetId=X  → documents for one machine (X is dash- or slash-form)
// GET /api/documents?equipmentId=X
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");
    const equipmentId = url.searchParams.get("equipmentId");

    const rows = await db
      .select({
        id: equipmentDocuments.id,
        equipmentId: equipmentDocuments.equipmentId,
        docType: equipmentDocuments.docType,
        title: equipmentDocuments.title,
        fileUrl: equipmentDocuments.fileUrl,
        status: equipmentDocuments.status,
        issuedDate: equipmentDocuments.issuedDate,
        expiryDate: equipmentDocuments.expiryDate,
        revision: equipmentDocuments.revision,
        notes: equipmentDocuments.notes,
        uploadedBy: equipmentDocuments.uploadedBy,
        equipmentName: equipment.name,
        assetId: equipment.assetId,
        category: equipment.category,
      })
      .from(equipmentDocuments)
      .leftJoin(equipment, eq(equipmentDocuments.equipmentId, equipment.id));

    let filtered = rows;
    if (equipmentId) filtered = rows.filter((r) => r.equipmentId === equipmentId);
    else if (assetId) {
      const slash = assetId.replace(/-/g, "/");
      filtered = rows.filter((r) => r.assetId === assetId || r.assetId === slash);
    }

    return NextResponse.json(filtered);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to fetch documents:", error);
    return NextResponse.json({ error: "Failed to fetch documents", details: message }, { status: 500 });
  }
}

// POST /api/documents → add a document record
export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const body = await request.json();
    if (!body.equipmentId || !body.docType || !body.title) {
      return NextResponse.json(
        { error: "equipmentId, docType and title are required" },
        { status: 400 },
      );
    }
    // An uploaded file (fileKey) is served through the auth-gated /api/files
    // route; fileUrl may alternatively hold an external link.
    const hasFile = !!body.fileKey || !!body.fileUrl;
    const doc = {
      id: nanoid(),
      equipmentId: body.equipmentId,
      docType: body.docType,
      title: body.title,
      fileUrl: body.fileKey ? `/api/files/${body.fileKey}` : body.fileUrl || null,
      fileKey: body.fileKey || null,
      fileName: body.fileName || null,
      mimeType: body.mimeType || null,
      fileSize: body.fileSize ?? null,
      status: body.status || (hasFile ? "AVAILABLE" : "REQUIRED"),
      issuedDate: body.issuedDate || null,
      expiryDate: body.expiryDate || null,
      revision: body.revision || null,
      notes: body.notes || null,
      uploadedBy: gate.actor?.name || null,
    };
    await db.insert(equipmentDocuments).values(doc);
    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to add document:", error);
    return NextResponse.json({ error: "Failed to add document", details: message }, { status: 500 });
  }
}
