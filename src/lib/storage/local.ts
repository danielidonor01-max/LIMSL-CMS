// src/lib/storage/local.ts
// Local filesystem storage backend. Writes under STORAGE_LOCAL_DIR (gitignored).
// Suitable for a self-hosted single-site server; on ephemeral/serverless hosts
// use the SUPABASE backend instead.
import { promises as fs } from "fs";
import path from "path";
import { config } from "@/lib/config";
import type { SavedFile, ServeResult } from "./index";

function baseDir() {
  return path.isAbsolute(config.storageLocalDir)
    ? config.storageLocalDir
    : path.join(process.cwd(), config.storageLocalDir);
}

// Guard against path traversal — a key must be a single flat filename.
function safeKey(key: string): string | null {
  if (!key || key.includes("/") || key.includes("\\") || key.includes("..")) return null;
  return key;
}

export async function saveFile(
  key: string,
  data: Uint8Array,
  meta: { name: string; mimeType: string },
): Promise<SavedFile> {
  const safe = safeKey(key);
  if (!safe) throw new Error("Invalid storage key");
  const dir = baseDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, safe), data);
  return { key: safe, name: meta.name, mimeType: meta.mimeType, size: data.byteLength };
}

export async function serveFile(key: string): Promise<ServeResult> {
  const safe = safeKey(key);
  if (!safe) return { kind: "notfound" };
  try {
    const body = await fs.readFile(path.join(baseDir(), safe));
    return { kind: "stream", body: new Uint8Array(body), mimeType: guessMime(safe), name: safe };
  } catch {
    return { kind: "notfound" };
  }
}

export async function deleteFile(key: string): Promise<void> {
  const safe = safeKey(key);
  if (!safe) return;
  await fs.rm(path.join(baseDir(), safe), { force: true });
}

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
};
function guessMime(name: string): string {
  const ext = name.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0]?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}
