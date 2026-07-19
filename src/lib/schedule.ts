// src/lib/schedule.ts
// Makes the maintenance schedule a *living* PM program rather than a static list:
//  • reconcileSchedule() — flips past-due open activities to OVERDUE (persisted),
//    so compliance/overdue figures always reflect today, not the seed snapshot.
//  • generateNextOccurrence() — when a PM is completed, spawns the next occurrence
//    from the activity's frequency, so the programme perpetuates itself.
// nextPlannedDate() is pure and covered by the frequency table below.
import { db } from "@/lib/db";
import { maintenanceSchedule } from "@/lib/db/schema";
import { and, eq, lt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

// Frequency → interval. Keys match equipment.maintenanceFrequency plus common aliases.
const FREQ_MONTHS: Record<string, number> = {
  MONTHLY: 1,
  BI_MONTHLY: 2,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  SEMI_ANNUAL: 6,
  SEMIANNUAL: 6,
  BI_ANNUAL: 6,
  ANNUAL: 12,
  YEARLY: 12,
};
const FREQ_DAYS: Record<string, number> = {
  DAILY: 1,
  WEEKLY: 7,
  BIWEEKLY: 14,
  FORTNIGHTLY: 14,
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Add months keeping the day-of-month, clamped to the target month's last day
// (so 31 Jan + 1 month → 28/29 Feb, never spilling into March).
function addMonths(base: Date, months: number): string {
  const day = base.getDate();
  const d = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return iso(d);
}

// The next planned date after `dateISO` for a given frequency, or null if the
// frequency is unknown/one-off.
export function nextPlannedDate(dateISO: string | null | undefined, freq: string | null | undefined): string | null {
  if (!dateISO || !freq) return null;
  const key = freq.toUpperCase().trim();
  const base = new Date(`${dateISO.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(base.getTime())) return null;
  if (FREQ_MONTHS[key]) return addMonths(base, FREQ_MONTHS[key]);
  if (FREQ_DAYS[key]) {
    base.setDate(base.getDate() + FREQ_DAYS[key]);
    return iso(base);
  }
  return null;
}

// Persist SCHEDULED → OVERDUE for any activity whose planned date has passed and
// which was never completed. Idempotent; safe to call on every schedule read.
export async function reconcileSchedule(now = new Date()): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  await db
    .update(maintenanceSchedule)
    .set({ status: "OVERDUE" })
    .where(
      and(
        eq(maintenanceSchedule.status, "SCHEDULED"),
        isNull(maintenanceSchedule.completedDate),
        lt(maintenanceSchedule.plannedDate, today),
      ),
    );
}

type ScheduleRow = typeof maintenanceSchedule.$inferSelect;

// Given a just-completed recurring activity, insert its next occurrence. Rolls the
// date forward past today so a long-overdue PM yields one upcoming date, not a
// backlog. Returns the new planned date, or null when non-recurring / already present.
export async function generateNextOccurrence(row: ScheduleRow, now = new Date()): Promise<string | null> {
  let next = nextPlannedDate(row.plannedDate, row.maintenanceFrequency);
  if (!next) return null;

  const today = now.toISOString().slice(0, 10);
  let guard = 0;
  while (next < today && guard++ < 120) {
    const n = nextPlannedDate(next, row.maintenanceFrequency);
    if (!n || n === next) break;
    next = n;
  }

  // Don't duplicate an occurrence that already exists for this machine + activity.
  const existing = await db
    .select({ id: maintenanceSchedule.id })
    .from(maintenanceSchedule)
    .where(
      and(
        eq(maintenanceSchedule.equipmentId, row.equipmentId),
        eq(maintenanceSchedule.activityType, row.activityType),
        eq(maintenanceSchedule.plannedDate, next),
      ),
    )
    .limit(1);
  if (existing.length) return null;

  const d = new Date(`${next}T00:00:00`);
  await db.insert(maintenanceSchedule).values({
    id: nanoid(),
    equipmentId: row.equipmentId,
    year: d.getFullYear(),
    quarter: Math.floor(d.getMonth() / 3) + 1,
    month: d.getMonth() + 1,
    plannedDate: next,
    activityType: row.activityType,
    taskDescription: row.taskDescription,
    maintenanceFrequency: row.maintenanceFrequency,
    responsiblePersonId: row.responsiblePersonId,
    responsiblePersonName: row.responsiblePersonName,
    status: "SCHEDULED",
  });
  return next;
}
