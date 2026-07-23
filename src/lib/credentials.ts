// src/lib/credentials.ts
// Provider API keys, managed from CMS Settings and consumed by AI providers.
// Resolution order: environment variable (platform-managed secret wins) → DB
// (AES-GCM encrypted, set via Settings UI). Consumers only ever call
// getApiKey(provider) — where the key lives is an admin decision, not code.
import { db } from "@/lib/db";
import { apiCredentials } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export const PROVIDERS = {
  GEMINI: { label: "Google Gemini", envVar: "GEMINI_API_KEY", note: "Free tier available (AI Studio)" },
  ANTHROPIC: { label: "Anthropic Claude", envVar: "ANTHROPIC_API_KEY", note: "Pay-as-you-go credits" },
} as const;
export type Provider = keyof typeof PROVIDERS;

export const isProvider = (v: string): v is Provider => v in PROVIDERS;

export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

// The key a server-side provider should use, or null when not configured.
export async function getApiKey(provider: Provider): Promise<string | null> {
  const env = process.env[PROVIDERS[provider].envVar];
  if (env && env.trim()) return env.trim();

  const [row] = await db.select().from(apiCredentials).where(eq(apiCredentials.provider, provider)).limit(1);
  if (!row || !row.enabled) return null;
  try {
    return decryptSecret(row.encryptedKey);
  } catch (err) {
    // AUTH_SECRET rotated since the key was saved — the admin must re-enter it.
    console.warn(`credentials: cannot decrypt ${provider} key (AUTH_SECRET changed?)`, err);
    return null;
  }
}

export async function setApiKey(
  provider: Provider,
  key: string,
  actor: { id?: string | null; name?: string | null },
): Promise<{ keyHint: string }> {
  const keyHint = maskKey(key);
  const values = {
    provider,
    encryptedKey: encryptSecret(key.trim()),
    keyHint,
    enabled: true,
    updatedById: actor.id ?? null,
    updatedByName: actor.name ?? null,
    updatedAt: new Date().toISOString(),
  };
  await db.insert(apiCredentials).values(values).onConflictDoUpdate({ target: apiCredentials.provider, set: values });
  return { keyHint };
}

export async function clearApiKey(provider: Provider): Promise<void> {
  await db.delete(apiCredentials).where(eq(apiCredentials.provider, provider));
}

export type CredentialStatus = {
  provider: Provider;
  label: string;
  note: string;
  configured: boolean;
  source: "ENV" | "DB" | null;
  keyHint: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
};

export async function listCredentials(): Promise<CredentialStatus[]> {
  const rows = await db.select().from(apiCredentials);
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return (Object.keys(PROVIDERS) as Provider[]).map((p) => {
    const meta = PROVIDERS[p];
    const env = process.env[meta.envVar];
    const row = byProvider.get(p);
    if (env && env.trim()) {
      return {
        provider: p, label: meta.label, note: meta.note,
        configured: true, source: "ENV", keyHint: maskKey(env),
        updatedByName: null, updatedAt: null,
      };
    }
    return {
      provider: p, label: meta.label, note: meta.note,
      configured: !!row?.enabled, source: row?.enabled ? "DB" : null,
      keyHint: row?.keyHint ?? null,
      updatedByName: row?.updatedByName ?? null,
      updatedAt: row?.updatedAt ?? null,
    };
  });
}

// Cheap, no-cost liveness checks against each provider's metadata endpoint.
export async function testApiKey(provider: Provider, key: string): Promise<{ ok: boolean; detail: string }> {
  try {
    if (provider === "GEMINI") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (res.ok) return { ok: true, detail: "Key accepted by Google AI." };
      const body = await res.json().catch(() => null);
      return { ok: false, detail: body?.error?.message ?? `Rejected (HTTP ${res.status}).` };
    }
    // ANTHROPIC — models list is a free metadata endpoint.
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true, detail: "Key accepted by Anthropic." };
    const body = await res.json().catch(() => null);
    return { ok: false, detail: body?.error?.message ?? `Rejected (HTTP ${res.status}).` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "Network error." };
  }
}
