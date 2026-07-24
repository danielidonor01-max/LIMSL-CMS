// src/app/api/import/[entity]/route.ts
// Go-live data import. GET returns a CSV template for the entity; POST parses an
// uploaded CSV/Excel file and either previews (mode=preview) or writes it
// (mode=commit). Super-Admin only — this seeds the production register.
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { parseSpreadsheet, toCsv } from "@/lib/import/parse";
import { ENTITIES, processImport, type EntityKey } from "@/lib/import/entities";

const isEntity = (v: string): v is EntityKey =>
  v === "equipment" || v === "schedule" || v === "users" || v === "components";

export async function GET(_request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!isEntity(entity)) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });

  const meta = ENTITIES[entity];
  const csv = toCsv(meta.headers, [meta.example]);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="limsl-${entity}-template.csv"`,
    },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  const { entity } = await params;
  if (!isEntity(entity)) return NextResponse.json({ error: "Unknown entity" }, { status: 404 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") || "preview");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const rows = await parseSpreadsheet(file);
    if (rows.length === 0) {
      return NextResponse.json({ error: "The file has no data rows. Check the header row matches the template." }, { status: 400 });
    }

    const result = await processImport(entity, rows, { id: gate.actor?.id, name: gate.actor?.name }, mode === "commit");
    return NextResponse.json(result);
  } catch (error) {
    console.error(`Import (${entity}) failed:`, error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
