// src/lib/db/seed-auth.ts
// Sets the bootstrap password for every seeded user so credentials login works.
//
// The default password is shared and committed to this repo, so it is a secret in
// name only. Every seeded account is therefore flagged `mustChangePassword`, which
// forces the holder to set their own password on first login before they can reach
// any page. Without that flag the COO, Factory Manager and Super Admin would all
// keep a publicly-known password indefinitely — an ISO 9001/45001 audit finding.
//
// Dev tip: to skip the forced-change screen while testing, clear the flag for one
// account rather than removing it here:
//   UPDATE users SET must_change_password = 0 WHERE email = '<you>@limsl.com';
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
    await db
      .update(users)
      .set({ passwordHash: hash, mustChangePassword: true })
      .where(eq(users.id, u.id));
  }
  console.log(`✅ Password set for ${all.length} users (bootstrap: "${DEFAULT_PASSWORD}")`);
  console.log("   ⚠ All accounts flagged mustChangePassword — each user must set their own on first login.");
  all.forEach((u) => console.log(`   • ${u.email} — ${u.role}`));
  console.log("🎉 Auth seed complete!");
}

seedAuth()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Auth seed failed:", e);
    process.exit(1);
  });
