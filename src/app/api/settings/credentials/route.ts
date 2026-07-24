// src/app/api/settings/credentials/route.ts
// Super-Admin management of provider API keys (CMS Settings → AI Provider API
// Keys). Keys are encrypted at rest and NEVER returned — responses carry only
// the masked hint. Every change is audit-logged.
//
//   GET               → provider statuses (configured, source ENV|DB, hint)
//   POST              → { provider, key }         — save (encrypt + audit)
//   POST ?action=test → { provider, key? }        — live-validate a key (or the stored one)
//   DELETE            → { provider }              — remove stored key
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { nanoid } from "nanoid";
import { requireRoles } from "@/lib/authz";
import { SETTINGS_WRITE_ROLES } from "@/lib/roles";
import {
  listCredentials, setApiKey, clearApiKey, getApiKey, testApiKey, isProvider,
} from "@/lib/credentials";

async function audit(actor: { id?: string | null; name?: string | null }, action: string, provider: string) {
  await db.insert(auditLog).values({
    id: nanoid(),
    userId: actor.id ?? null,
    userName: actor.name || "Super Admin",
    action,
    entityType: "api_credential",
    entityId: provider,
    entityDescription: `${action === "DELETE" ? "Removed" : "Updated"} ${provider} API key`,
  });
}

export async function GET() {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  try {
    return NextResponse.json({ providers: await listCredentials() });
  } catch (error) {
    console.error("Failed to list credentials:", error);
    return NextResponse.json({ error: "Failed to list credentials" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  try {
    const isTest = new URL(request.url).searchParams.get("action") === "test";
    const body = await request.json();
    const provider = String(body.provider || "");
    if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });

    if (isTest) {
      const key = typeof body.key === "string" && body.key.trim() ? body.key.trim() : await getApiKey(provider);
      if (!key) return NextResponse.json({ ok: false, detail: "No key to test — enter or save one first." });
      const result = await testApiKey(provider, key);
      return NextResponse.json(result);
    }

    const key = String(body.key || "").trim();
    if (key.length < 10) return NextResponse.json({ error: "That doesn't look like a valid API key." }, { status: 400 });

    const { keyHint } = await setApiKey(provider, key, { id: gate.actor?.id, name: gate.actor?.name });
    await audit({ id: gate.actor?.id, name: gate.actor?.name }, "UPDATE", provider);
    return NextResponse.json({ saved: true, keyHint });
  } catch (error) {
    console.error("Credential save failed:", error);
    return NextResponse.json({ error: "Credential save failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireRoles(SETTINGS_WRITE_ROLES);
  if (gate.res) return gate.res;
  try {
    const body = await request.json();
    const provider = String(body.provider || "");
    if (!isProvider(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    await clearApiKey(provider);
    await audit({ id: gate.actor?.id, name: gate.actor?.name }, "DELETE", provider);
    return NextResponse.json({ removed: true });
  } catch (error) {
    console.error("Credential removal failed:", error);
    return NextResponse.json({ error: "Credential removal failed" }, { status: 500 });
  }
}
