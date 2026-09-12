// src/lib/db/seed-base.ts
// Runs the base seed on its own.
//
// seed.ts exports seedDatabase() and never calls it, so the only way to run it
// was migrate-and-seed.ts, which first replays SQL from the drizzle/ folder.
// That folder is gitignored and each environment regenerates it, so on a fresh
// machine there is nothing to replay and the seed is unreachable behind a
// migration step that fails.
//
// `npx drizzle-kit push` already builds the schema straight from schema.ts,
// which is the documented simplest path. This is the other half of it: the data,
// without the migration replay. Every other seed in this directory is runnable
// this way and the base one is now no different.
import { seedDatabase } from "./seed";

seedDatabase()
  .then(() => {
    console.log("Base seed complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Base seed failed:", err);
    process.exit(1);
  });
