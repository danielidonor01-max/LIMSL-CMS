// src/lib/storage/supabase.ts
// Supabase Storage backend (cloud) over the REST API — no SDK dependency.
// Activate with STORAGE_PROVIDER=SUPABASE and set SUPABASE_URL,
// SUPABASE_SERVICE_KEY, SUPABASE_BUCKET. Files stay private; serveFile returns a
// short-lived signed URL that the /api/files route redirects to.
import { config } from "@/lib/config";
import type { SavedFile, ServeResult } from "./index";

function ensureReady() {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error("Supabase storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY).");
  }
}

const objectUrl = (key: string) =>
  `${config.supabaseUrl}/storage/v1/object/${config.supabaseBucket}/${encodeURIComponent(key)}`;

export async function saveFile(
  key: string,
  data: Uint8Array,
  meta: { name: string; mimeType: string },
): Promise<SavedFile> {
  ensureReady();
  const res = await fetch(objectUrl(key), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.supabaseServiceKey}`,
      "Content-Type": meta.mimeType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: data as unknown as BodyInit,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Supabase upload failed (${res.status}): ${detail}`);
  }
  return { key, name: meta.name, mimeType: meta.mimeType, size: data.byteLength };
}

export async function serveFile(key: string): Promise<ServeResult> {
  ensureReady();
  // Ask Supabase for a signed URL valid for 5 minutes.
  const res = await fetch(
    `${config.supabaseUrl}/storage/v1/object/sign/${config.supabaseBucket}/${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expiresIn: 300 }),
    },
  );
  if (!res.ok) return { kind: "notfound" };
  const data = await res.json().catch(() => null);
  if (!data?.signedURL) return { kind: "notfound" };
  return { kind: "redirect", url: `${config.supabaseUrl}/storage/v1${data.signedURL}` };
}

export async function deleteFile(key: string): Promise<void> {
  ensureReady();
  await fetch(objectUrl(key), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${config.supabaseServiceKey}` },
  }).catch(() => {});
}
