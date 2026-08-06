// src/app/api/sharepoint/import/route.ts
// Pull one Excel register straight from SharePoint through the SAME import
// pipeline as a manual upload: preview shows what would land; commit writes it.
// POST { itemId, entity, mode: "preview" | "commit" }
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { getSharepointConfig, downloadFile, SharepointError } from "@/lib/sharepoint";
import { parseSpreadsheet } from "@/lib/import/parse";
import { ENTITIES, processImport, type EntityKey } from "@/lib/import/entities";

const isEntity = (v: string): v is EntityKey => v in ENTITIES;

export async function POST(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  try {
    const body = await request.json();
    const itemId = String(body.itemId || "");
    const entity = String(body.entity || "");
    const mode = body.mode === "commit" ? "commit" : "preview";
    if (!itemId) return NextResponse.json({ error: "Pick a file first." }, { status: 400 });
    if (!isEntity(entity)) return NextResponse.json({ error: "Unknown entity." }, { status: 400 });

    const cfg = await getSharepointConfig();
    if (!cfg) return NextResponse.json({ error: "SharePoint is not connected — configure it in App Settings." }, { status: 400 });

    const { bytes, name } = await downloadFile(cfg, itemId);
    const file = new File([bytes], name, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const rows = await parseSpreadsheet(file);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: `"${name}" has no data rows — check its header row matches the ${entity} template.` },
        { status: 400 },
      );
    }

    const result = await processImport(entity, rows, { id: gate.actor?.id, name: gate.actor?.name }, mode === "commit");
    return NextResponse.json({ ...result, file: name });
  } catch (error) {
    if (error instanceof SharepointError) return NextResponse.json({ error: error.message }, { status: 502 });
    console.error("SharePoint import failed:", error);
    return NextResponse.json({ error: "SharePoint import failed" }, { status: 500 });
  }
}
