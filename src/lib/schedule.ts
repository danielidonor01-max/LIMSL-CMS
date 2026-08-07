// src/lib/schedule.ts
// Makes the maintenance schedule a *living* PM program rather than a static list:
//  • reconcileSchedule() — flips past-due open activities to OVERDUE (persisted),
//    so compliance/overdue figures always reflect today, not the seed snapshot.
//  • generateNextOccurrence() — when a PM is completed, spawns the next occurrence
//    from the activity's frequency, so the programme perpetuates itself.
// nextPlannedDate() is pure and covered by the frequency table below.
import { db } from "@/lib/db";
import { maintenanceSchedule } from "@/lib/db/schema";
import { and, eq, inArray, lt, isNull } from "drizzle-orm";
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

// Persist → OVERDUE for any activity whose planned date has passed and which was
// never completed. RESCHEDULED rows are deliberately included: a reschedule moves
// the date, it does not exempt the activity — otherwise rescheduling would
// permanently hide work from the overdue KPI and escalations. Idempotent; safe to
// call on every schedule read.
export async function reconcileSchedule(now = new Date()): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  await db
    .update(maintenanceSchedule)
    .set({ status: "OVERDUE" })
    .where(
      and(
        inArray(maintenanceSchedule.status, ["SCHEDULED", "RESCHEDULED"]),
        isNull(maintenanceSchedule.completedDate),
        lt(maintenanceSchedule.plannedDate, today),
      ),
    );

  // A deferral is a time-boxed risk acceptance, not an exemption. Once the
  // agreed review date passes the activity returns to OVERDUE and re-enters the
  // compliance denominator — otherwise deferring would be a permanent place to
  // hide work, which is exactly the behaviour the register exists to stop. The
  // justification and approver stay on the row.
  await db
    .update(maintenanceSchedule)
    .set({ status: "OVERDUE" })
    .where(
      and(
        eq(maintenanceSchedule.status, "DEFERRED"),
        isNull(maintenanceSchedule.completedDate),
        lt(maintenanceSchedule.deferredReviewDate, today),
      ),
    );
}

// Keep the PM PROGRAMME alive independently of completions.
//
// generateNextOccurrence only fires when a PM is completed, so an activity that
// is never done never spawns its successor: a neglected machine's occurrences
// dry up, its missed PMs age out of the compliance denominator, and PM
// compliance RISES the longer you ignore it. That is a self-concealing failure
// mode — the metric improves as the maintenance stops.
//
// A plan is a plan: every recurring series must always own at least one future
// dated occurrence, whether or not the last one was done. Idempotent.
export async function ensureFutureOccurrences(now = new Date()): Promise<number> {
  const today = now.toISOString().slice(0, 10);
  const all = await db.select().from(maintenanceSchedule);

  // One series per machine + activity type. Non-recurring one-offs are skipped.
  const series = new Map<string, ScheduleRow[]>();
  for (const row of all) {
    if (!row.maintenanceFrequency) continue;
    const key = `${row.equipmentId}|${row.activityType}`;
    series.set(key, [...(series.get(key) ?? []), row]);
  }

  let created = 0;
  for (const rows of series.values()) {
    if (rows.some((r) => r.plannedDate >= today && r.status !== "COMPLETED")) continue;
    // Roll forward from the most recent planned date in the series.
    const latest = [...rows].sort((a, b) => b.plannedDate.localeCompare(a.plannedDate))[0];
    try {
      if (await generateNextOccurrence(latest, now)) created++;
    } catch (err) {
      console.warn("ensureFutureOccurrences: could not extend a series", err);
    }
  }
  return created;
}

type ScheduleRow = typeof maintenanceSchedule.$inferSelect;
// Accepts either the global client or an in-flight transaction, so the PM
// completion flow can spawn the next occurrence atomically with the rest.
type Dbc = Pick<typeof db, "select" | "insert">;

// Given a just-completed recurring activity, insert its next occurrence. Rolls the
// date forward past today so a long-overdue PM yields one upcoming date, not a
// backlog. Returns the new planned date, or null when non-recurring / already present.
export async function generateNextOccurrence(row: ScheduleRow, now = new Date(), dbc: Dbc = db): Promise<string | null> {
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
  const existing = await dbc
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
  await dbc.insert(maintenanceSchedule).values({
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
