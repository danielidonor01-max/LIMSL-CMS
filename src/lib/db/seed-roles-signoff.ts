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

  // ── 1. Remap existing users to canonical roles ──────────────────────────
  // whatsapp numbers are PLACEHOLDERS (valid +234 format) so notification
  // recipient resolution works in demo; replace with real numbers in the user
  // admin screen before enabling WhatsApp delivery.
  const remap: Record<string, { role: string; department: string; jobTitle: string; whatsapp: string }> = {
    "daniel.idonor@limsl.com": { role: "SUPER_ADMIN", department: "MANAGEMENT", jobTitle: "System Owner / Maintenance Technician", whatsapp: "+2348030000001" },
    "kingsley.iworah@limsl.com": { role: "MAINTENANCE_MANAGER", department: "MAINTENANCE", jobTitle: "Electrical Maintenance Supervisor", whatsapp: "+2348030000002" },
    "marcel.imadojiemu@limsl.com": { role: "TECHNICIAN", department: "MAINTENANCE", jobTitle: "Welding Machine Technician", whatsapp: "+2348030000003" },
    "godspower.michael@limsl.com": { role: "TECHNICIAN", department: "MAINTENANCE", jobTitle: "CNC / AC Technician", whatsapp: "+2348030000004" },
    "kenneth.aloziem@limsl.com": { role: "FACTORY_MANAGER", department: "FACTORY", jobTitle: "Factory Coordinator", whatsapp: "+2348030000005" },
    "osaghale.ikpea@limsl.com": { role: "COO", department: "MANAGEMENT", jobTitle: "Chief Operating Officer", whatsapp: "+2348030000006" },
  };
  for (const [email, v] of Object.entries(remap)) {
    await db.update(users).set(v).where(eq(users.email, email));
  }

  // ── 2. Add Foreman / QA-QC / HSE officers ───────────────────────────────
  const newUsers = [
    { name: "Sunday Okoro", email: "sunday.okoro@limsl.com", role: "FOREMAN", department: "MAINTENANCE", jobTitle: "Maintenance Foreman", whatsapp: "+2348030000007" },
    { name: "Blessing Ade", email: "blessing.ade@limsl.com", role: "QA_QC", department: "QA_QC", jobTitle: "QA/QC Officer", whatsapp: "+2348030000008" },
    { name: "Tunde Bello", email: "tunde.bello@limsl.com", role: "HSE", department: "HSE", jobTitle: "HSE Officer", whatsapp: "+2348030000009" },
  ];
  const hash = hashPassword(PASSWORD);
  for (const u of newUsers) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, u.email)).limit(1);
    if (existing) {
      await db.update(users).set({ role: u.role, department: u.department, jobTitle: u.jobTitle, whatsapp: u.whatsapp }).where(eq(users.id, existing.id));
    } else {
      await db.insert(users).values({ id: nanoid(), ...u, passwordHash: hash, isActive: true, mustChangePassword: false });
    }
  }
  console.log(`✅ 6 users remapped, ${newUsers.length} officers ensured (default password: "${PASSWORD}")`);

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
