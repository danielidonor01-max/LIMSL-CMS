// src/lib/db/seed-schedule.ts
// Phase 2 seed: generates the 2026 annual maintenance schedule, a set of
// upcoming/open PM work orders, and the 6 historically-completed crane PM
// checklists (mirrors the LIMSL PM checklist documents).
//
// Kept separate from seed.ts (Gemini's Phase 1 base seed) so the two branches
// don't collide. Safe to re-run: it clears the tables it owns first.

import { db } from "./index";
import {
  equipment,
  users,
  maintenanceSchedule,
  workOrders,
  pmChecklists,
} from "./schema";
import { nanoid } from "nanoid";
import { sql } from "drizzle-orm";

const YEAR = 2026;
const TODAY = new Date(); // seed runs in Node — Date is available here

// Frequency → the months (1-12) a PM/activity falls in for the year
function monthsForFrequency(freq: string | null): number[] {
  switch (freq) {
    case "MONTHLY":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case "BI_MONTHLY":
      return [1, 3, 5, 7, 9, 11];
    case "QUARTERLY":
      return [2, 5, 8, 11];
    case "SEMI_ANNUAL":
      return [3, 9];
    case "ANNUAL":
      return [6];
    default:
      return [2, 5, 8, 11]; // default quarterly
  }
}

function iso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function quarterOf(month: number): number {
  return Math.ceil(month / 3);
}

export async function seedSchedule() {
  console.log("🗓️  Seeding 2026 maintenance schedule (Phase 2)...");

  const allEquipment = await db.select().from(equipment);
  const allUsers = await db.select().from(users);
  const technicians = allUsers.filter((u) => u.role === "TECHNICIAN");
  const supervisor = allUsers.find((u) => u.role === "SUPERVISOR");

  // Clear the tables this seed owns (idempotent re-runs)
  await db.delete(pmChecklists);
  await db.delete(workOrders);
  await db.delete(maintenanceSchedule);

  type ScheduleRow = typeof maintenanceSchedule.$inferInsert;
  type WorkOrderRow = typeof workOrders.$inferInsert;
  type ChecklistRow = typeof pmChecklists.$inferInsert;

  const scheduleRows: ScheduleRow[] = [];
  const workOrderRows: WorkOrderRow[] = [];
  const checklistRows: ChecklistRow[] = [];

  let completedCounter = 0; // used to make ~20% of past PMs COMPLETED (matches KPI reality)
  let woSeq = 0;

  const nextWoNumber = () => `WO-${YEAR}-${String(++woSeq).padStart(4, "0")}`;

  allEquipment.forEach((eq, eqIndex) => {
    const tech = technicians[eqIndex % Math.max(technicians.length, 1)];
    const months = monthsForFrequency(eq.maintenanceFrequency);

    months.forEach((month, mi) => {
      // Spread PM days across the month deterministically so calendars aren't stacked
      const day = ((eqIndex + mi * 3) % 26) + 2;
      const plannedDate = iso(YEAR, month, day);
      const planned = new Date(plannedDate + "T00:00:00");
      const isPast = planned.getTime() < TODAY.getTime();

      let status: string;
      let completedDate: string | null = null;
      if (isPast) {
        // ~20% completed (reflecting documented 20% PM compliance), rest overdue
        if (completedCounter % 5 === 0) {
          status = "COMPLETED";
          completedDate = plannedDate;
        } else {
          status = "OVERDUE";
        }
        completedCounter++;
      } else {
        status = "SCHEDULED";
      }

      const scheduleId = nanoid();
      scheduleRows.push({
        id: scheduleId,
        equipmentId: eq.id,
        year: YEAR,
        quarter: quarterOf(month),
        month,
        plannedDate,
        activityType: "PM",
        taskDescription: `${eq.maintenanceFrequency ?? "QUARTERLY"} preventive maintenance — ${eq.name}`,
        maintenanceFrequency: eq.maintenanceFrequency,
        responsiblePersonId: tech?.id,
        responsiblePersonName: tech?.name,
        status,
        completedDate,
      });
    });

    // Quarterly compliance inspection (INS) for cranes and electrical panels
    if (eq.category === "CRANE" || eq.category === "ELECTRICAL_PANEL") {
      [3, 6, 9, 12].forEach((month) => {
        const plannedDate = iso(YEAR, month, 20);
        const isPast = new Date(plannedDate + "T00:00:00").getTime() < TODAY.getTime();
        scheduleRows.push({
          id: nanoid(),
          equipmentId: eq.id,
          year: YEAR,
          quarter: quarterOf(month),
          month,
          plannedDate,
          activityType: "INS",
          taskDescription: `Quarterly compliance inspection — ${eq.name}`,
          maintenanceFrequency: eq.maintenanceFrequency,
          responsiblePersonId: tech?.id,
          responsiblePersonName: tech?.name,
          status: isPast ? "OVERDUE" : "SCHEDULED",
        });
      });
    }
  });

  // ── Open/upcoming work orders: create a WO for every scheduled PM in the
  //    next 45 days so the Work Orders list has actionable, real items. ──────
  const soon = new Date(TODAY.getTime() + 45 * 24 * 60 * 60 * 1000);
  scheduleRows
    .filter((s) => {
      if (s.status !== "SCHEDULED" || s.activityType !== "PM") return false;
      const d = new Date(s.plannedDate + "T00:00:00");
      return d.getTime() <= soon.getTime();
    })
    .forEach((s) => {
      const eq = allEquipment.find((e) => e.id === s.equipmentId)!;
      const woId = nanoid();
      workOrderRows.push({
        id: woId,
        workOrderNumber: nextWoNumber(),
        type: "PREVENTIVE",
        equipmentId: eq.id,
        scheduleId: s.id,
        priority: eq.criticality === "CRITICAL" || eq.criticality === "HIGH" ? "HIGH" : "MEDIUM",
        status: "OPEN",
        title: `PM — ${eq.name}`,
        description: s.taskDescription,
        plannedDate: s.plannedDate,
        technicianId: s.responsiblePersonId,
        technicianName: s.responsiblePersonName,
        supervisorId: supervisor?.id,
      });
      s.workOrderId = woId;
    });

  // ── Historical: the 6 cranes already have completed PM checklists (per the
  //    LIMSL PM checklist documents). Build completed WO + signed checklist
  //    for the earliest past crane PM. ────────────────────────────────────────
  const cranes = allEquipment.filter((e) => e.category === "CRANE");
  cranes.forEach((crane) => {
    const cranePastPMs = scheduleRows
      .filter((s) => s.equipmentId === crane.id && s.activityType === "PM")
      .filter((s) => new Date(s.plannedDate + "T00:00:00").getTime() < TODAY.getTime())
      .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
    const target = cranePastPMs[0];
    if (!target) return;

    target.status = "COMPLETED";
    target.completedDate = target.plannedDate;

    const tech = allUsers.find((u) => u.id === target.responsiblePersonId);
    const woId = nanoid();
    const woNumber = nextWoNumber();
    workOrderRows.push({
      id: woId,
      workOrderNumber: woNumber,
      type: "PREVENTIVE",
      equipmentId: crane.id,
      scheduleId: target.id,
      priority: "HIGH",
      status: "COMPLETED",
      title: `PM — ${crane.name}`,
      description: target.taskDescription,
      plannedDate: target.plannedDate,
      startDate: target.plannedDate,
      completionDate: target.plannedDate,
      actualDuration: 2.5,
      technicianId: tech?.id,
      technicianName: tech?.name,
      supervisorId: supervisor?.id,
    });
    target.workOrderId = woId;

    const passItems = (labels: string[]) =>
      JSON.stringify(labels.map((l) => ({ item: l, status: "OK", remarks: "" })));

    checklistRows.push({
      id: nanoid(),
      workOrderId: woId,
      equipmentId: crane.id,
      date: target.plannedDate,
      ptwIssued: true,
      lotoApplied: true,
      ppeWorn: true,
      areaSafe: true,
      visualInspection: passItems([
        "Structural frame & welds",
        "Hook & safety latch",
        "Wire rope condition",
        "Warning labels & signage",
      ]),
      functionalTests: passItems([
        "Hoist up/down",
        "Long travel",
        "Cross travel",
        "Upper/lower limit switches",
        "Emergency stop",
      ]),
      lubrication: passItems(["Wire rope greased", "Gearbox oil level", "Bearings greased"]),
      electricalChecks: passItems([
        "Pendant control",
        "Festoon cabling",
        "Panel tightness",
        "Earthing continuity",
      ]),
      observations: "All parameters within acceptable limits. No abnormalities found.",
      correctiveActionRequired: false,
      pmCompleted: true,
      nextPMDate: iso(YEAR, (new Date(target.plannedDate).getMonth() + 3) % 12 || 12, 15),
      technicianName: tech?.name,
      supervisorName: supervisor?.name,
      signedAt: target.plannedDate,
    });
  });

  // Insert in FK-safe order
  if (scheduleRows.length)
    await db.insert(maintenanceSchedule).values(scheduleRows);
  if (workOrderRows.length) await db.insert(workOrders).values(workOrderRows);
  if (checklistRows.length) await db.insert(pmChecklists).values(checklistRows);

  console.log(`✅ ${scheduleRows.length} schedule activities`);
  console.log(`✅ ${workOrderRows.length} work orders (open + completed)`);
  console.log(`✅ ${checklistRows.length} completed crane PM checklists`);
  console.log("🎉 Phase 2 schedule seed complete!");
}

// Allow running directly: `npx tsx src/lib/db/seed-schedule.ts`
seedSchedule()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Schedule seed failed:", e);
    process.exit(1);
  });
