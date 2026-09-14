// src/lib/db/migrate-and-seed.ts
import { seedDatabase } from "./seed";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as path from "path";
import * as fs from "fs";

// Ensure .env.local is loaded if DATABASE_URL is not yet set
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const idx = trimmed.indexOf("=");
          const k = trimmed.slice(0, idx).trim();
          const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[k]) process.env[k] = v;
        }
      }
    }
  } catch {}
}

async function main() {
  console.log("🚀 Starting database migration on Supabase...");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set in environment or .env.local");
  
  console.log(`Connecting to database...`);
  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  try {
    console.log("Applying Drizzle schema migrations (53 tables)...");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("✅ Migrations applied successfully!");

    console.log("\n🌱 Seeding database with historical plant data...");
    await seedDatabase();

    const { seedRolesAndSignoff } = await import("./seed-roles-signoff");
    await seedRolesAndSignoff();

    const { loadFacilityAssets } = await import("../facility-assets-load");
    await loadFacilityAssets();

    const { seedSchedule } = await import("./seed-schedule");
    await seedSchedule();

    const { seedProcedure } = await import("./seed-procedure");
    await seedProcedure();

    const { seedCorrectiveWms } = await import("./seed-corrective-wms");
    await seedCorrectiveWms();

    console.log("\n🎉 Full Supabase database migration and seeding completed successfully!");
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration or seeding failed:", error);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

main();
