// src/lib/db/seed-training.ts
// Phase: Training & Competency. Seeds the competency matrix (person × skill area
// with an assessed proficiency level) and a set of training records. Idempotent.

import { db } from "./index";
import { users, trainingRecords, competencyMatrix } from "./schema";
import { nanoid } from "nanoid";

const TODAY = new Date();
const daysFromNow = (d: number) =>
  new Date(TODAY.getTime() + d * 864e5).toISOString().slice(0, 10);

// Skill areas assessed for the maintenance ecosystem.
const SKILL_AREAS: { skillArea: string; category: string; requiredLevel: number }[] = [
  { skillArea: "Electrical Fault Diagnosis", category: "TECHNICAL", requiredLevel: 3 },
  { skillArea: "Hydraulic Systems", category: "TECHNICAL", requiredLevel: 2 },
  { skillArea: "PLC / Control Systems", category: "TECHNICAL", requiredLevel: 2 },
  { skillArea: "Mechanical / Welding Repair", category: "TECHNICAL", requiredLevel: 3 },
  { skillArea: "Preventive Maintenance Procedures", category: "TECHNICAL", requiredLevel: 3 },
  { skillArea: "LOTO / Permit-to-Work", category: "HSE", requiredLevel: 3 },
  { skillArea: "Root Cause Analysis", category: "QA_QC", requiredLevel: 2 },
];

export async function seedTraining() {
  console.log("🎓 Seeding training records & competency matrix...");

  const allUsers = await db.select().from(users);
  const byName = (needle: string) =>
    allUsers.find((u) => (u.name ?? "").toLowerCase().includes(needle.toLowerCase()));

  await db.delete(competencyMatrix);
  await db.delete(trainingRecords);

  // ── Competency matrix ──────────────────────────────────────────────────
  // level: 0 None · 1 Aware · 2 Competent · 3 Proficient · 4 Expert
  const assessments: { name: string; levels: Partial<Record<string, number>> }[] = [
    {
      name: "Kingsley",
      levels: {
        "Electrical Fault Diagnosis": 4,
        "PLC / Control Systems": 3,
        "Preventive Maintenance Procedures": 4,
        "LOTO / Permit-to-Work": 4,
        "Root Cause Analysis": 3,
      },
    },
    {
      name: "Marcel",
      levels: {
        "Mechanical / Welding Repair": 4,
        "Electrical Fault Diagnosis": 2,
        "Preventive Maintenance Procedures": 3,
        "LOTO / Permit-to-Work": 3,
      },
    },
    {
      name: "Godspower",
      levels: {
        "PLC / Control Systems": 3,
        "Electrical Fault Diagnosis": 3,
        "Hydraulic Systems": 2,
        "Preventive Maintenance Procedures": 2,
        "LOTO / Permit-to-Work": 2,
      },
    },
    {
      name: "Daniel",
      levels: {
        "Electrical Fault Diagnosis": 3,
        "PLC / Control Systems": 2,
        "Root Cause Analysis": 3,
        "LOTO / Permit-to-Work": 3,
        "Preventive Maintenance Procedures": 3,
      },
    },
    {
      name: "Sunday",
      levels: {
        "Mechanical / Welding Repair": 3,
        "Preventive Maintenance Procedures": 3,
        "Hydraulic Systems": 3,
        "LOTO / Permit-to-Work": 4,
      },
    },
    {
      name: "Tunde",
      levels: {
        "LOTO / Permit-to-Work": 4,
        "Root Cause Analysis": 2,
      },
    },
  ];

  const assessor = byName("Kingsley");
  const rows = [];
  for (const person of assessments) {
    const u = byName(person.name);
    for (const skill of SKILL_AREAS) {
      const level = person.levels[skill.skillArea] ?? 0;
      // Only seed rows where the person is on the register for that skill (level>0)
      // or the skill is mandatory for everyone (LOTO/PM), so gaps surface.
      const mandatory =
        skill.skillArea === "LOTO / Permit-to-Work" ||
        skill.skillArea === "Preventive Maintenance Procedures";
      if (level === 0 && !mandatory) continue;

      // Recert due dates for safety-critical skills.
      const expiry =
        skill.skillArea === "LOTO / Permit-to-Work"
          ? daysFromNow(person.name === "Marcel" ? -20 : 240)
          : null;

      rows.push({
        id: nanoid(),
        userId: u?.id ?? null,
        employeeName: u?.name ?? person.name,
        role: u?.role ?? null,
        skillArea: skill.skillArea,
        category: skill.category,
        level,
        requiredLevel: skill.requiredLevel,
        assessedBy: assessor?.name ?? "Maintenance Manager",
        assessedDate: daysFromNow(-90),
        expiryDate: expiry,
        notes: null,
      });
    }
  }
  if (rows.length) await db.insert(competencyMatrix).values(rows);

  // ── Training records ───────────────────────────────────────────────────
  const trainings = [
    {
      name: "Marcel",
      trainingTitle: "LOTO & Permit-to-Work Refresher",
      category: "HSE",
      type: "INTERNAL",
      trainer: "Tunde Bello (HSE)",
      plannedOffset: 7,
      status: "PLANNED",
    },
    {
      name: "Godspower",
      trainingTitle: "Siemens S7 PLC Diagnostics (OEM)",
      category: "TECHNICAL",
      type: "OEM",
      trainer: "Siemens Field Engineer",
      plannedOffset: -30,
      actualOffset: -28,
      status: "COMPLETED",
      certificateIssued: true,
    },
    {
      name: "Kingsley",
      trainingTitle: "Root Cause Analysis (5-Why & Fishbone)",
      category: "QA_QC",
      type: "EXTERNAL",
      trainer: "Blessing Ade (QA/QC)",
      plannedOffset: -60,
      actualOffset: -60,
      status: "COMPLETED",
      certificateIssued: true,
    },
    {
      name: "Sunday",
      trainingTitle: "Hydraulic Press Maintenance",
      category: "TECHNICAL",
      type: "INTERNAL",
      trainer: "Kingsley Iworah",
      plannedOffset: 14,
      status: "PLANNED",
    },
  ];

  const trainingRows = trainings.map((t) => {
    const u = byName(t.name);
    return {
      id: nanoid(),
      userId: u?.id ?? null,
      employeeName: u?.name ?? t.name,
      trainingTitle: t.trainingTitle,
      category: t.category,
      type: t.type,
      trainer: t.trainer,
      targetGroup: "Maintenance Team",
      plannedDate: daysFromNow(t.plannedOffset),
      actualDate: t.actualOffset !== undefined ? daysFromNow(t.actualOffset) : null,
      duration: "1 day",
      certificateIssued: !!t.certificateIssued,
      certificateUrl: null,
      status: t.status,
    };
  });
  if (trainingRows.length) await db.insert(trainingRecords).values(trainingRows);

  console.log(`   ✓ ${rows.length} competency rows, ${trainingRows.length} training records`);
}

// Allow running standalone: `npx tsx src/lib/db/seed-training.ts`
if (process.argv[1] && process.argv[1].includes("seed-training")) {
  seedTraining()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
