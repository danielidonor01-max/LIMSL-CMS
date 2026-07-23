// src/lib/crypto.ts
// Symmetric encryption for secrets at rest (API keys in api_credentials).
// AES-256-GCM with a key derived from AUTH_SECRET — no new secret to manage,
// and the DB alone (e.g. a leaked backup) cannot reveal the plaintext.
// Server-only: node:crypto must never enter a client bundle.
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

function derivedKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set — cannot encrypt credentials.");
  // Domain-separated derivation so this key is distinct from any other
  // AUTH_SECRET use.
  return createHash("sha256").update(`${secret}:limsl-api-credentials`).digest();
}

// Format: base64(iv):base64(authTag):base64(ciphertext)
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload.");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
