// src/lib/db/migrate-and-seed.ts
import { seedDatabase } from "./seed";
import { db } from "./index";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as path from "path";

async function main() {
  console.log("🚀 Starting database migration...");
  try {
    // Run migrations from drizzle folder
    await migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    console.log("✅ Migrations applied successfully!");

    // Run seed
    await seedDatabase();
    console.log("✅ Database migration and seeding completed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Migration or seeding failed:", error);
    process.exit(1);
  }
}

main();
