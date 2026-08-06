// src/lib/sharepoint.ts
// Microsoft Graph connector (app-only client credentials) for pulling the
// company's live Excel registers straight from SharePoint into the import
// pipeline. Setup needs an Azure "App registration" with the APPLICATION
// permission Sites.Read.All (admin-consented); the tenant/client/secret are
// stored AES-GCM-encrypted in api_credentials under the SHAREPOINT row —
// deliberately NOT in the AI PROVIDERS registry, so it never joins the AI
// failover chain.
import { db } from "@/lib/db";
import { apiCredentials } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { maskKey } from "@/lib/credentials";

const ROW_KEY = "SHAREPOINT";

export type SharepointConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  siteUrl: string; // e.g. https://contoso.sharepoint.com/sites/Maintenance
};

export type SharepointStatus = {
  configured: boolean;
  siteUrl: string | null;
  clientIdHint: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
};

export async function getSharepointConfig(): Promise<SharepointConfig | null> {
  const [row] = await db.select().from(apiCredentials).where(eq(apiCredentials.provider, ROW_KEY)).limit(1);
  if (!row || !row.enabled) return null;
  try {
    const cfg = JSON.parse(decryptSecret(row.encryptedKey)) as SharepointConfig;
    return cfg.tenantId && cfg.clientId && cfg.clientSecret && cfg.siteUrl ? cfg : null;
  } catch (err) {
    console.warn("sharepoint: cannot decrypt config (AUTH_SECRET changed?)", err);
    return null;
  }
}

export async function setSharepointConfig(
  cfg: SharepointConfig,
  actor: { id?: string | null; name?: string | null },
): Promise<void> {
  const values = {
    provider: ROW_KEY,
    encryptedKey: encryptSecret(JSON.stringify(cfg)),
    keyHint: maskKey(cfg.clientId),
    enabled: true,
    updatedById: actor.id ?? null,
    updatedByName: actor.name ?? null,
    updatedAt: new Date().toISOString(),
  };
  await db.insert(apiCredentials).values(values).onConflictDoUpdate({ target: apiCredentials.provider, set: values });
}

export async function clearSharepointConfig(): Promise<void> {
  await db.delete(apiCredentials).where(eq(apiCredentials.provider, ROW_KEY));
}

export async function sharepointStatus(): Promise<SharepointStatus> {
  const [row] = await db.select().from(apiCredentials).where(eq(apiCredentials.provider, ROW_KEY)).limit(1);
  const cfg = await getSharepointConfig();
  return {
    configured: !!cfg,
    siteUrl: cfg?.siteUrl ?? null,
    clientIdHint: row?.keyHint ?? null,
    updatedByName: row?.updatedByName ?? null,
    updatedAt: row?.updatedAt ?? null,
  };
}

// ── Graph calls ──────────────────────────────────────────────────────────────

export class SharepointError extends Error {}

async function getToken(cfg: SharepointConfig): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const d = await res.json().catch(() => null);
  if (!res.ok || !d?.access_token) {
    throw new SharepointError(d?.error_description?.split("\n")[0] ?? `Azure sign-in failed (HTTP ${res.status}). Check tenant ID, client ID and secret.`);
  }
  return d.access_token;
}

async function graph<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const d = await res.json().catch(() => null);
  if (!res.ok) {
    throw new SharepointError(d?.error?.message ?? `Graph request failed (HTTP ${res.status}).`);
  }
  return d as T;
}

// https://contoso.sharepoint.com/sites/Maintenance → sites/contoso.sharepoint.com:/sites/Maintenance
function siteGraphPath(siteUrl: string): string {
  const u = new URL(siteUrl);
  const path = u.pathname.replace(/\/$/, "");
  return path && path !== "/" ? `/sites/${u.hostname}:${path}` : `/sites/${u.hostname}`;
}

// Validates the whole chain (token → site) and returns the site's display name.
export async function testSharepoint(cfg: SharepointConfig): Promise<{ ok: boolean; detail: string }> {
  try {
    const token = await getToken(cfg);
    const site = await graph<{ id: string; displayName?: string; webUrl?: string }>(token, siteGraphPath(cfg.siteUrl));
    return { ok: true, detail: `Connected to "${site.displayName ?? site.webUrl ?? cfg.siteUrl}".` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Connection failed." };
  }
}

export type SharepointFile = {
  id: string;
  name: string;
  webUrl: string | null;
  size: number | null;
  lastModified: string | null;
  lastModifiedBy: string | null;
  folder: string | null;
};

// Excel files on the site's default document library, newest first.
export async function listExcelFiles(cfg: SharepointConfig): Promise<SharepointFile[]> {
  const token = await getToken(cfg);
  const site = await graph<{ id: string }>(token, siteGraphPath(cfg.siteUrl));
  const found = await graph<{ value: Array<Record<string, any>> }>(
    token,
    `/sites/${site.id}/drive/root/search(q='.xlsx')?$top=50&$select=id,name,webUrl,size,lastModifiedDateTime,lastModifiedBy,parentReference,file`,
  );
  return (found.value ?? [])
    .filter((f) => f.file && /\.xlsx?$/i.test(f.name ?? ""))
    .map((f) => ({
      id: String(f.id),
      name: String(f.name),
      webUrl: f.webUrl ?? null,
      size: f.size ?? null,
      lastModified: f.lastModifiedDateTime ?? null,
      lastModifiedBy: f.lastModifiedBy?.user?.displayName ?? null,
      folder: f.parentReference?.path ? String(f.parentReference.path).split("root:")[1] || "/" : null,
    }))
    .sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
}

export async function downloadFile(cfg: SharepointConfig, itemId: string): Promise<{ bytes: ArrayBuffer; name: string }> {
  const token = await getToken(cfg);
  const site = await graph<{ id: string }>(token, siteGraphPath(cfg.siteUrl));
  const meta = await graph<{ name: string }>(token, `/sites/${site.id}/drive/items/${encodeURIComponent(itemId)}?$select=name`);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/items/${encodeURIComponent(itemId)}/content`,
    { headers: { Authorization: `Bearer ${token}` }, redirect: "follow", signal: AbortSignal.timeout(60_000) },
  );
  if (!res.ok) throw new SharepointError(`Download failed (HTTP ${res.status}).`);
  return { bytes: await res.arrayBuffer(), name: meta.name };
}
