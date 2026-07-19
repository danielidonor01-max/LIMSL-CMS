// src/lib/db/migrate-only.ts
// Applies pending Drizzle migrations (from ./drizzle) to the Postgres DATABASE_URL
// without running seeds. For initial Supabase setup, `npx drizzle-kit push` is
// simpler; this exists for the generate + migrate workflow.
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as path from "path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await client.end();
  console.log("✅ Pending migrations applied.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  });
