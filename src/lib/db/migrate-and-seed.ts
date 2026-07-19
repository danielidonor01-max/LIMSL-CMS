// src/lib/db/migrate-and-seed.ts
import { seedDatabase } from "./seed";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as path from "path";

async function main() {
  console.log("🚀 Starting database migration...");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("✅ Migrations applied successfully!");
    await seedDatabase();
    console.log("✅ Database migration and seeding completed!");
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration or seeding failed:", error);
    await client.end();
    process.exit(1);
  }
}

main();
