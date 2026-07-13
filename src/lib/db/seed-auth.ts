// src/lib/db/seed-auth.ts
// Sets a password for every seeded user so credentials login works.
// Default password for all accounts: "limsl2026" (change in production).
import { db } from "./index";
import { users } from "./schema";
import { hashPassword } from "../password";
import { eq } from "drizzle-orm";

const DEFAULT_PASSWORD = "limsl2026";

export async function seedAuth() {
  console.log("🔐 Setting user passwords...");
  const all = await db.select().from(users);
  const hash = hashPassword(DEFAULT_PASSWORD);
  for (const u of all) {
    await db.update(users).set({ passwordHash: hash }).where(eq(users.id, u.id));
  }
  console.log(`✅ Password set for ${all.length} users (default: "${DEFAULT_PASSWORD}")`);
  all.forEach((u) => console.log(`   • ${u.email} — ${u.role}`));
  console.log("🎉 Auth seed complete!");
}

seedAuth()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Auth seed failed:", e);
    process.exit(1);
  });
