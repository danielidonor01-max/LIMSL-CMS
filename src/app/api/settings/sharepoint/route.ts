// src/app/api/settings/sharepoint/route.ts
// SharePoint (Microsoft Graph) connection management. Save validates the whole
// chain (Azure token → site resolve) before storing; secrets are AES-GCM
// encrypted and only ever returned as a masked hint.
import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import {
  sharepointStatus,
  setSharepointConfig,
  clearSharepointConfig,
  testSharepoint,
  getSharepointConfig,
} from "@/lib/sharepoint";

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  return NextResponse.json(await sharepointStatus());
}

export async function POST(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;

  try {
    const body = await request.json();

    // Re-test of the saved connection without re-entering the secret.
    if (body.action === "test") {
      const cfg = await getSharepointConfig();
      if (!cfg) return NextResponse.json({ ok: false, detail: "Not configured yet." }, { status: 400 });
      return NextResponse.json(await testSharepoint(cfg));
    }

    const cfg = {
      tenantId: String(body.tenantId || "").trim(),
      clientId: String(body.clientId || "").trim(),
      clientSecret: String(body.clientSecret || "").trim(),
      siteUrl: String(body.siteUrl || "").trim().replace(/\/$/, ""),
    };
    if (!cfg.tenantId || !cfg.clientId || !cfg.clientSecret || !cfg.siteUrl) {
      return NextResponse.json({ error: "Tenant ID, Client ID, Client Secret and Site URL are all required." }, { status: 400 });
    }
    try {
      new URL(cfg.siteUrl);
    } catch {
      return NextResponse.json({ error: "Site URL must be a full URL, e.g. https://yourcompany.sharepoint.com/sites/Maintenance" }, { status: 400 });
    }

    const test = await testSharepoint(cfg);
    if (!test.ok) return NextResponse.json({ error: `Connection failed — ${test.detail}` }, { status: 400 });

    await setSharepointConfig(cfg, gate.actor ?? {});
    await db.insert(auditLog).values({
      id: nanoid(),
      userId: gate.actor?.id ?? null,
      userName: gate.actor?.name ?? "Admin",
      action: "UPDATE",
      entityType: "settings",
      entityId: "sharepoint",
      entityDescription: `SharePoint connection saved — ${cfg.siteUrl}`,
    });
    return NextResponse.json({ ok: true, detail: test.detail, status: await sharepointStatus() });
  } catch (error) {
    console.error("SharePoint settings failed:", error);
    return NextResponse.json({ error: "Failed to save SharePoint connection" }, { status: 500 });
  }
}

export async function DELETE() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  await clearSharepointConfig();
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: gate.actor?.id ?? null,
    userName: gate.actor?.name ?? "Admin",
    action: "DELETE",
    entityType: "settings",
    entityId: "sharepoint",
    entityDescription: "SharePoint connection removed",
  });
  return NextResponse.json({ ok: true });
}
