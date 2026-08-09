// src/app/api/sharepoint/files/route.ts
// Excel files on the connected SharePoint site (newest first), the pick list
// for "Import from SharePoint".
import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import { getSharepointConfig, listExcelFiles, SharepointError } from "@/lib/sharepoint";

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  try {
    const cfg = await getSharepointConfig();
    if (!cfg) return NextResponse.json({ error: "SharePoint is not connected, configure it in App Settings." }, { status: 400 });
    return NextResponse.json({ files: await listExcelFiles(cfg) });
  } catch (error) {
    if (error instanceof SharepointError) return NextResponse.json({ error: error.message }, { status: 502 });
    console.error("SharePoint list failed:", error);
    return NextResponse.json({ error: "Could not list SharePoint files" }, { status: 500 });
  }
}
