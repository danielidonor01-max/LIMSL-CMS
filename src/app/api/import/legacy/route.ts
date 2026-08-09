// src/app/api/import/legacy/route.ts
// Import the three legacy LIMSL workbooks exactly as they are kept, no
// reshaping into templates. POST formData { file, kind: register | history |
// schedule, mode: preview | commit }. Super-Admin only, like the sibling
// per-entity import route.
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { processLegacyImport, LEGACY_KINDS, type LegacyKind } from "@/lib/import/legacy";

const isKind = (v: string): v is LegacyKind => v in LEGACY_KINDS;

export async function POST(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "");
    const mode = String(form.get("mode") || "preview");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    if (!isKind(kind)) {
      return NextResponse.json({ error: "Unknown legacy workbook kind" }, { status: 400 });
    }

    const result = await processLegacyImport(
      kind,
      await file.arrayBuffer(),
      { id: gate.actor?.id, name: gate.actor?.name },
      mode === "commit",
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Legacy import failed:", error);
    const message = error instanceof Error && /workbook/i.test(error.message) ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
