// src/lib/storage/index.ts
// Provider-agnostic file storage. Two backends behind one interface:
//   LOCAL    — filesystem on the server (default; right for a self-hosted site)
//   SUPABASE — cloud object storage over REST (right for a hosted/multi-site deploy)
// Switch with STORAGE_PROVIDER; nothing else changes. Files are always served
// through the auth-gated /api/files route, never as public URLs.
import { config } from "@/lib/config";
import * as local from "./local";
import * as supabase from "./supabase";

export type SavedFile = { key: string; name: string; mimeType: string; size: number };
export type ServeResult =
  | { kind: "stream"; body: Uint8Array; mimeType: string; name: string }
  | { kind: "redirect"; url: string }
  | { kind: "notfound" };

function backend() {
  return config.storageProvider === "SUPABASE" ? supabase : local;
}

// Persist bytes at `key` and return the stored-file metadata. Callers generate
// the key with makeKey() and store it to serve/delete the file later.
export async function saveFile(
  key: string,
  data: Uint8Array,
  meta: { name: string; mimeType: string },
): Promise<SavedFile> {
  return backend().saveFile(key, data, meta);
}

export async function serveFile(key: string): Promise<ServeResult> {
  return backend().serveFile(key);
}

export async function deleteFile(key: string): Promise<void> {
  return backend().deleteFile(key);
}

// A safe, collision-resistant storage key that keeps the original extension.
export function makeKey(originalName: string, id: string): string {
  const ext = (originalName.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
  const safeBase = originalName
    .replace(/\.[a-zA-Z0-9]{1,8}$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 60);
  return `${id}-${safeBase}${ext}`;
}
