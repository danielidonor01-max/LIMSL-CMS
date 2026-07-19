// src/lib/db/index.ts
// Postgres (Supabase) via postgres.js. On serverless (Vercel) use Supabase's
// pooled connection string — the Transaction pooler on port 6543 — and keep
// prepare:false, which pgBouncer's transaction mode requires.
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? "";
if (!connectionString && process.env.NODE_ENV !== "production") {
  console.warn("[db] DATABASE_URL is not set — queries will fail until it is configured.");
}

// Reuse one client across hot-reloads / warm lambdas instead of opening a new
// pool per module evaluation.
const globalForDb = globalThis as unknown as { _pg?: ReturnType<typeof postgres> };
const client = globalForDb._pg ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb._pg = client;

export const db = drizzle(client, { schema });
export type DbClient = typeof db;
