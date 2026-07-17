// src/app/api/files/route.ts
// Upload endpoint. Accepts a single multipart file, stores it via the storage
// layer (local or cloud, per config), and returns its metadata. The caller then
// records the file against an entity (e.g. an equipment document).
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { MAINTENANCE_WRITE_ROLES } from "@/lib/roles";
import { config, storageReady } from "@/lib/config";
import { saveFile, makeKey } from "@/lib/storage";

const ALLOWED = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

export async function POST(request: Request) {
  try {
    const gate = await requireRoles(MAINTENANCE_WRITE_ROLES);
    if (gate.res) return gate.res;

    const ready = storageReady();
    if (!ready.ready) {
      return NextResponse.json(
        { error: `File storage is not configured: ${ready.reason}` },
        { status: 503 },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided (field 'file')." }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "File is empty." }, { status: 400 });
    }
    if (file.size > config.storageMaxBytes) {
      return NextResponse.json(
        { error: `File exceeds the ${Math.round(config.storageMaxBytes / 1_048_576)} MB limit.` },
        { status: 413 },
      );
    }
    const mimeType = file.type || "application/octet-stream";
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${mimeType}. Allowed: PDF, images, Office docs, CSV, text.` },
        { status: 415 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const key = makeKey(file.name || "file", nanoid());
    const saved = await saveFile(key, bytes, { name: file.name || key, mimeType });

    return NextResponse.json(
      { key: saved.key, name: saved.name, mimeType: saved.mimeType, size: saved.size, url: `/api/files/${saved.key}` },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("File upload failed:", error);
    return NextResponse.json({ error: "File upload failed", details: error.message }, { status: 500 });
  }
}
