// src/lib/db/index.ts
// Supports both:
// 1. Local development: Embedded persistent PGlite (.pgdata directory) - no Docker required.
// 2. Production / Cloud: Postgres (Supabase) via postgres.js.
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import * as schema from "./schema";
import path from "path";

const connectionString = (process.env.DATABASE_URL ?? "").trim();

// Use embedded PGlite when in local development without an external database,
// or when explicitly configured as 'pglite' / local container.
const isRemotePostgres =
  connectionString &&
  !connectionString.includes("127.0.0.1:15432") &&
  !connectionString.includes("localhost:15432") &&
  connectionString !== "pglite" &&
  !connectionString.startsWith("pglite://") &&
  (connectionString.startsWith("postgresql://") || connectionString.startsWith("postgres://"));

const globalForDb = globalThis as unknown as {
  _db?: any;
  _pglite?: PGlite;
  _pg?: ReturnType<typeof postgres>;
};

function getDbInstance() {
  if (globalForDb._db) return globalForDb._db;

  if (isRemotePostgres) {
    if (!globalForDb._pg) {
      globalForDb._pg = postgres(connectionString, { prepare: false });
    }
    globalForDb._db = drizzlePg(globalForDb._pg, { schema });
  } else {
    if (!globalForDb._pglite) {
      const dataDir = path.resolve(process.cwd(), ".pgdata");
      globalForDb._pglite = new PGlite(dataDir);
    }
    globalForDb._db = drizzlePglite(globalForDb._pglite, { schema });
  }

  return globalForDb._db;
}

// Lazy proxy: ensures database client (especially PGlite) is never eagerly initialized
// during module evaluation or route tracing, avoiding worker file lock contention during builds.
export const db = new Proxy({} as ReturnType<typeof drizzlePg<typeof schema>>, {
  get(_target, prop, receiver) {
    const targetDb = getDbInstance();
    const value = Reflect.get(targetDb, prop, receiver);
    if (typeof value === "function") {
      return value.bind(targetDb);
    }
    return value;
  },
});

export type DbClient = ReturnType<typeof drizzlePg<typeof schema>>;

