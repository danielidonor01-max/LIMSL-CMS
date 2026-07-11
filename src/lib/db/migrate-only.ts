// src/lib/db/migrate-only.ts
// Applies pending Drizzle migrations without running seeds.
import { db } from "./index";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as path from "path";

migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
console.log("✅ Pending migrations applied.");
process.exit(0);
