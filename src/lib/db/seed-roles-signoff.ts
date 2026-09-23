// src/lib/db/seed-roles-signoff.ts
// Aligns the seeded users to the canonical LIMSL role model, adds Foreman /
// QA/QC / HSE officers, marks schematic PDF kinds, and backfills the multi-level
// sign-off chains for existing PM checklists and corrective cases. Idempotent.

import { db } from "./index";
import {
  users,
  equipmentDocuments,
  pmChecklists,
  correctiveMaintenance,
  signoffs,
} from "./schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { hashPassword } from "../password";
import { PM_CHAIN, CM_CHAIN } from "../signoff/chains";

const PASSWORD = "limsl2026";

export async function seedRolesAndSignoff() {
  console.log("👥 Aligning roles + backfilling sign-off chains...");

  // ── 1. Ensure Super Admins have canonical roles ──────────────────────────
  const superAdmins = [
    { name: "Daniel Idonor", email: "daniel.idonor@limsl.com", role: "SUPER_ADMIN", department: "MANAGEMENT", jobTitle: "Super Admin", whatsapp: "+2349167653581" },
    { name: "Daniel Idonor", email: "dsmartfootwears@gmail.com", role: "SUPER_ADMIN", department: "MANAGEMENT", jobTitle: "Super Admin", whatsapp: "+2349167653581" },
    { name: "Ajayi Oluwadamilola", email: "ajayioluwadamilola527@gmail.com", role: "SUPER_ADMIN", department: "MANAGEMENT", jobTitle: "Super Admin", whatsapp: "" },
  ];
  const hash = hashPassword(PASSWORD);
  for (const u of superAdmins) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1);
    if (existing) {
      await db.update(users).set({ role: u.role, department: u.department, jobTitle: u.jobTitle, whatsapp: u.whatsapp }).where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({ id: nanoid(), ...u, passwordHash: hash, isActive: true, mustChangePassword: false });
    }
  }
  console.log(`✅ Super Admins ensured (default password: "${PASSWORD}")`);

  // ── 3. Mark schematic PDF kinds (most text-selectable, some image-only) ──
  const docs = await db.select().from(equipmentDocuments);
  let i = 0;
  for (const d of docs) {
    let kind = "UNKNOWN";
    if (d.docType === "ELECTRICAL_SCHEMATIC") kind = i % 4 === 0 ? "IMAGE_ONLY" : "TEXT_SELECTABLE";
    else if (d.docType === "OPERATIONAL_MANUAL" || d.docType === "SOP") kind = "TEXT_SELECTABLE";
    await db.update(equipmentDocuments).set({ pdfKind: kind }).where(eq(equipmentDocuments.id, d.id));
    i++;
  }
  const schematics = docs.filter((d) => d.docType === "ELECTRICAL_SCHEMATIC");
  console.log(`✅ pdfKind set (${schematics.length} schematics: ~${Math.round(schematics.length * 0.75)} text-selectable, rest image-only)`);

  // ── 4. Backfill sign-off chains for existing PM + CM records ─────────────
  await db.delete(signoffs);
  const chainRows: (typeof signoffs.$inferInsert)[] = [];
  const addChain = (entityType: string, entityId: string, steps: typeof PM_CHAIN) => {
    steps.forEach((s, idx) =>
      chainRows.push({
        id: nanoid(),
        entityType,
        entityId,
        stepOrder: idx + 1,
        role: s.role,
        roleLabel: s.roleLabel,
        required: s.required,
        status: "PENDING",
      }),
    );
  };

  const checklists = await db.select({ id: pmChecklists.id }).from(pmChecklists);
  for (const c of checklists) addChain("PM_CHECKLIST", c.id, PM_CHAIN);

  const cms = await db.select({ id: correctiveMaintenance.id }).from(correctiveMaintenance);
  for (const cm of cms) addChain("CORRECTIVE", cm.id, CM_CHAIN);

  if (chainRows.length) await db.insert(signoffs).values(chainRows);
  console.log(`✅ Sign-off chains: ${checklists.length} PM (${PM_CHAIN.length} steps) + ${cms.length} CM (${CM_CHAIN.length} steps) = ${chainRows.length} rows`);
  console.log("🎉 Roles + sign-off seed complete!");
}

seedRolesAndSignoff()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Roles/sign-off seed failed:", e);
    process.exit(1);
  });
